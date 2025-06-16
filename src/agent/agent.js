import { History } from './history.js';
import { Coder } from './coder.js';
import { VisionInterpreter } from './vision/vision_interpreter.js';
import { Prompter } from '../models/prompter.js';
import { initModes } from './modes.js';
import { initBot } from '../utils/mcdata.js';
import { containsCommand, commandExists, executeCommand, truncCommandMessage, isAction, blacklistCommands } from './commands/index.js';
import { ActionManager } from './action_manager.js';
import { NPCContoller } from './npc/controller.js';
import { MemoryBank } from './memory_bank.js';
import { SelfPrompter } from './self_prompter.js';
import convoManager from './conversation.js';
import { handleTranslation, handleEnglishTranslation } from '../utils/translator.js';
import { addBrowserViewer } from './vision/browser_viewer.js';
import settings from '../../settings.js';
import { serverProxy } from './agent_proxy.js';
import { Task } from './tasks/tasks.js';
import { say } from './speak.js';

// Helper function to parse internal info messages
function _parseInternalInfoMessage(message) {
    let match;
    // Try parsing INFO_HANDLING_DIRECT_TASK
    match = message.match(/\(INFO_HANDLING_DIRECT_TASK\) Player '([^']*)' said: '([^']*)'/);
    if (match) {
        return { originalPlayerUsername: match[1], originalPlayerMessage: match[2] };
    }
    // Try parsing INFO_DELEGATED_SIMPLE_TASK
    match = message.match(/\(INFO_DELEGATED_SIMPLE_TASK\) For player '([^']*)' message '([^']*)'/);
    if (match) {
        return { originalPlayerUsername: match[1], originalPlayerMessage: match[2] };
    }
    return null;
}

export class Agent {
    async start(profile_fp, load_mem=false, init_message=null, count_id=0, task_path=null, task_id=null) {
        this.last_sender = null;
        this.count_id = count_id;
        this.isProcessingSTT = false; // Initialize STT processing flag
        this.activeCoordinationContext = null; // For multi-agent coordination
        this.coordinationSuggestionTimeout = null; // Timeout for suggestions
        if (!profile_fp) {
            throw new Error('No profile filepath provided');
        }
        
        console.log('Starting agent initialization with profile:', profile_fp);
        
        // Initialize components with more detailed error handling
        console.log('Initializing action manager...');
        this.actions = new ActionManager(this);
        console.log('Initializing prompter...');
        this.prompter = new Prompter(this, profile_fp);
        this.name = this.prompter.getName();
        console.log('Initializing history...');
        this.history = new History(this);
        console.log('Initializing coder...');
        this.coder = new Coder(this);
        console.log('Initializing npc controller...');
        this.npc = new NPCContoller(this);
        console.log('Initializing memory bank...');
        this.memory_bank = new MemoryBank();
        console.log('Initializing self prompter...');
        this.self_prompter = new SelfPrompter(this);
        convoManager.initAgent(this);
        console.log('Initializing examples...');
        await this.prompter.initExamples();
        console.log('Initializing task...');

        // load mem first before doing task
        let save_data = null;
        if (load_mem) {
            save_data = this.history.load();
        }
        let taskStart = null;
        if (save_data) {
            taskStart = save_data.taskStart;
        } else {
            taskStart = Date.now();
        }
        this.task = new Task(this, task_path, task_id, taskStart);
        this.blocked_actions = settings.blocked_actions.concat(this.task.blocked_actions || []);
        blacklistCommands(this.blocked_actions);

        serverProxy.connect(this);

        console.log(this.name, 'logging into minecraft...');
        this.bot = initBot(this.name);

        initModes(this);

        

        this.bot.on('login', () => {
            console.log(this.name, 'logged in!');
            serverProxy.login();
            
            // Set skin for profile, requires Fabric Tailor. (https://modrinth.com/mod/fabrictailor)
            if (this.prompter.profile.skin)
                this.bot.chat(`/skin set URL ${this.prompter.profile.skin.model} ${this.prompter.profile.skin.path}`);
            else
                this.bot.chat(`/skin clear`);
        });

        const spawnTimeout = setTimeout(() => {
            process.exit(0);
        }, 30000);
        this.bot.once('spawn', async () => {
            try {
                clearTimeout(spawnTimeout);
                addBrowserViewer(this.bot, count_id);

                // wait for a bit so stats are not undefined
                await new Promise((resolve) => setTimeout(resolve, 1000));
                
                console.log(`${this.name} spawned.`);
                this.clearBotLogs();
              
                this._setupEventHandlers(save_data, init_message);
                this.startEvents();
              
                if (!load_mem) {
                    if (task_path !== null) {
                        this.task.initBotTask();
                        this.task.setAgentGoal();
                    }
                } else {
                    // set the goal without initializing the rest of the task
                    if (task_path !== null) {
                        this.task.setAgentGoal();
                    }
                }

                await new Promise((resolve) => setTimeout(resolve, 10000));
                this.checkAllPlayersPresent();
              
                console.log('Initializing vision intepreter...');
                this.vision_interpreter = new VisionInterpreter(this, settings.allow_vision);

            } catch (error) {
                console.error('Error in spawn event:', error);
                process.exit(0);
            }
        });
    }

    async _setupEventHandlers(save_data, init_message) {
        const ignore_messages = [
            "Set own game mode to",
            "Set the time to",
            "Set the difficulty to",
            "Teleported ",
            "Set the weather to",
            "Gamerule "
        ];
        
        // Modified respondFunc to include message_type and leader election
        const respondFunc = async (username, message, message_type, isCoordinatedAction = false) => {
            if (username === this.name) return; // Message from self, ignore.
            if (settings.only_chat_with.length > 0 && !settings.only_chat_with.includes(username)) return; // Not in allowed list

            try {
                if (ignore_messages.some((m) => message.startsWith(m))) return;

                this.shut_up = false; // Allow agent to speak if it was previously told to shut up.

                // IPB (Initial Processing Bot) and Team Coordination Logic
                if (!isCoordinatedAction && message_type === 'chat' && !convoManager.isOtherAgent(username)) {
                    const onlineAgents = convoManager.getInGameAgents();
                    if (onlineAgents.length > 0) { // Only proceed if there are any agents online
                        let ipbName = null;
                        let mentionedAgent = null;

                        // Identify if an agent was explicitly mentioned
                        for (const agentName of onlineAgents) {
                            const mentionRegex = new RegExp(`\\b${agentName}\\b`, 'i');
                            if (mentionRegex.test(message)) {
                                mentionedAgent = agentName;
                                break;
                            }
                        }

                        if (mentionedAgent) {
                            ipbName = mentionedAgent;
                        } else if (onlineAgents.length > 0) { // Default to Coordinator if no one specific is mentioned
                            ipbName = [...onlineAgents].sort()[0]; // Alphabetically first is default Coordinator/IPB
                        }

                        if (ipbName) {
                            if (this.name === ipbName) {
                                console.log(`[${this.name}] I am the Initial Processing Bot (IPB) for player ${username}'s message: '${message}'. Assessing now.`);
                                // Call the assessment function (to be implemented in the next step)
                                this.assessAndRoutePlayerMessage(username, message);
                                return;
                            } else if (onlineAgents.includes(this.name)) { // Current bot is an online agent but not IPB
                                console.log(`[${this.name}] Aware of player ${username}'s message: '${message}'. IPB is ${ipbName}. Awaiting further directives.`);
                                return;
                            }
                        } else if (onlineAgents.length > 0) {
                            // This case should ideally not be reached if default coordinator logic is sound
                            console.warn(`[${this.name}] Multi-agent scenario, but no IPB determined for message: "${message}". This agent will not respond.`);
                            return;
                        }
                        // If onlineAgents.length === 0, or if this agent is not part of onlineAgents (e.g. during startup/shutdown),
                        // it will fall through to single agent logic / normal processing.
                        // Also, if onlineAgents.length === 1 and this.name is that agent, it will also fall through.
                    }
                }

                // Fallback to normal processing for:
                // - Single agent mode (onlineAgents.length <= 1, and this agent is the one)
                // - Whispers
                // - Messages from other bots (that aren't EXECUTE_TASK or suggestions)
                // - Coordinated actions that have been delegated back to an agent
                console.log(`[${this.name}] received ${message_type} from ${username}: "${message}" (Processing via standard path).`);

                if (convoManager.isOtherAgent(username) && message_type === 'whisper') {
                    console.log(`[${this.name}] Standard processing for whisper from another agent ${username}.`);
                }

                let translation = await handleEnglishTranslation(message);
                this.handleMessage(username, translation, { isCoordinatedAction });

            } catch (error) {
                console.error(`[${this.name}] Error in respondFunc for ${message_type} from ${username}:`, error);
            }
        }

		this.respondFunc = respondFunc;

        // Pass message_type to respondFunc
        this.bot.on('whisper', (username, message) => respondFunc(username, message, 'whisper'));
        this.bot.on('chat', (username, message) => respondFunc(username, message, 'chat'));

        // Set up auto-eat
        this.bot.autoEat.options = {
            priority: 'foodPoints',
            startAt: 14,
            bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
        };

        if (save_data?.self_prompt) {
            if (init_message) {
                this.history.add('system', init_message);
            }
            await this.self_prompter.handleLoad(save_data.self_prompt, save_data.self_prompting_state);
        }
        if (save_data?.last_sender) {
            this.last_sender = save_data.last_sender;
            if (convoManager.otherAgentInGame(this.last_sender)) {
                const msg_package = {
                    message: `You have restarted and this message is auto-generated. Continue the conversation with me.`,
                    start: true
                };
                convoManager.receiveFromBot(this.last_sender, msg_package);
            }
        }
        else if (init_message) {
            await this.handleMessage('system', init_message, 2);
        }
        else {
            this.openChat("Hello world! I am "+this.name);
        }
    }

    checkAllPlayersPresent() {
        if (!this.task || !this.task.agent_names) {
          return;
        }

        const missingPlayers = this.task.agent_names.filter(name => !this.bot.players[name]);
        if (missingPlayers.length > 0) {
            console.log(`Missing players/bots: ${missingPlayers.join(', ')}`);
            this.cleanKill('Not all required players/bots are present in the world. Exiting.', 4);
        }
    }

    requestInterrupt() {
        this.bot.interrupt_code = true;
        this.bot.stopDigging();
        this.bot.collectBlock.cancelTask();
        this.bot.pathfinder.stop();
        this.bot.pvp.stop();
    }

    clearBotLogs() {
        this.bot.output = '';
        this.bot.interrupt_code = false;
    }

    shutUp() {
        this.shut_up = true;
        if (this.self_prompter.isActive()) {
            this.self_prompter.stop(false);
        }
        convoManager.endAllConversations();
    }

    async handleMessage(source, message, options = {}) {
        const { max_responses = null, isCoordinatedAction = false } = options;

        // Handle internal team messages first
        if (convoManager.isOtherAgent(source)) {
            if (message.startsWith('(REQUEST_COORDINATION)')) {
                console.log(`[${this.name}] Received REQUEST_COORDINATION from ${source}: "${message}"`);
                // Regex to capture: Player 'USERNAME' said: 'MESSAGE'. IPB IPB_NAME assessed it as needing full team discussion. Please coordinate. Reason: REASON
                const match = message.match(/\(REQUEST_COORDINATION\) Player '([^']*)' said: '([^']*)'. IPB (\w+) assessed it as needing full team discussion. Please coordinate. Reason: (.*)/);
                if (match) {
                    const originalPlayerUsername = match[1];
                    const originalPlayerMessage = match[2];
                    const requestingIPBName = match[3];
                    // const reason = match[4]; // Reason is captured but not explicitly used yet, good for logging.
                    console.log(`[${this.name}] Default Coordinator processing coordination request from IPB ${requestingIPBName} for player ${originalPlayerUsername}'s message: "${originalPlayerMessage}".`);
                    this.initiateTeamDiscussion(originalPlayerUsername, originalPlayerMessage);
                } else {
                    console.error(`[${this.name}] Could not parse REQUEST_COORDINATION directive: ${message}`);
                }
                return;
            } else if (message.startsWith('(INFO_HANDLING_DIRECT_TASK)') || message.startsWith('(INFO_DELEGATED_SIMPLE_TASK)')) {
                console.log(`[${this.name}] Received info message from ${source}: "${message}"`);
                const parsedDetails = _parseInternalInfoMessage(message); // Use helper
                if (parsedDetails &&
                    this.activeCoordinationContext &&
                    this.activeCoordinationContext.originalUsername === parsedDetails.originalPlayerUsername &&
                    this.activeCoordinationContext.originalMessage === parsedDetails.originalPlayerMessage &&
                    this.activeCoordinationContext.status === 'awaiting_suggestions') {

                    console.log(`[${this.name}] Cancelling full coordination for "${parsedDetails.originalPlayerMessage}" as an IPB has fast-pathed it.`);
                    if(this.coordinationSuggestionTimeout) {
                        clearTimeout(this.coordinationSuggestionTimeout);
                        this.coordinationSuggestionTimeout = null;
                    }
                    this.activeCoordinationContext = null;
                }
                return;
            }
            // EXECUTE_TASK and suggestion handling are below, after this initial block for new directives.
        }


        // Handle (EXECUTE_TASK) directives from Coordinator
        if (convoManager.isOtherAgent(source) && message.startsWith('(EXECUTE_TASK)')) {
            console.log(`[${this.name}] Received EXECUTE_TASK directive from ${source}: "${message}"`);

            const usernameMatch = message.match(/Player '([^']*)'/);
            const originalMsgMatch = message.match(/original message: '([^']*)'/);
            // const actionSummaryMatch = message.match(/Please proceed with: (.*)$/); // Action summary is for context, bot should process original message

            if (usernameMatch && originalMsgMatch) {
                const originalPlayer = usernameMatch[1];
                const originalPlayerMessage = originalMsgMatch[1];
                // const taskSummary = actionSummaryMatch ? actionSummaryMatch[1] : "No summary provided.";

                console.log(`[${this.name}] Executing task delegated by Coordinator for player ${originalPlayer} concerning message: "${originalPlayerMessage}".`);

                // Process the original player's message as if it were a direct command/query to this bot.
                // isCoordinatedAction: true prevents this from re-triggering coordination logic in respondFunc.
                // Note: The action_summary from the Coordinator's decision is implicitly handled by the LLM
                // when it processes the originalPlayerMessage in this context, as the bot's main prompt
                // will guide its response/action based on that original message.
                // If the action_summary was a direct chat message for the player, the Coordinator would have sent it.
                // If it was a command, this handleMessage call will execute it.
                await this.handleMessage(originalPlayer, originalPlayerMessage, { isCoordinatedAction: true });
            } else {
                console.error(`[${this.name}] Could not parse EXECUTE_TASK directive: ${message}`);
            }
            return; // Directive handled.
        }

        // Handle incoming suggestions if this agent is a Coordinator awaiting suggestions
        if (this.activeCoordinationContext &&
            this.activeCoordinationContext.status === 'awaiting_suggestions' &&
            convoManager.isOtherAgent(source) &&
            !message.startsWith('(TEAM_COORDINATION)')) { // Ensure it's a suggestion, not a broadcast

            console.log(`[${this.name}] Coordinator received suggestion from ${source}: "${message}"`);
            this.activeCoordinationContext.teamSuggestions[source] = message;
            this.activeCoordinationContext.receivedFrom.push(source);

            const expectedAgents = convoManager.getInGameAgents().filter(name => name !== this.name);
            if (this.activeCoordinationContext.receivedFrom.length >= expectedAgents.length) {
                console.log(`[${this.name}] All expected suggestions received for player message: "${this.activeCoordinationContext.originalMessage}".`);
                if (this.coordinationSuggestionTimeout) {
                    clearTimeout(this.coordinationSuggestionTimeout);
                    this.coordinationSuggestionTimeout = null;
                }
                this.activeCoordinationContext.status = 'making_decision';
                this.processTeamSuggestionsAndDecide(); // Call decision making
            }
            return; // Suggestion handled, stop further processing of this message by handleMessage's main logic
        }

        await this.checkTaskDone();
        if (!source || !message) {
            console.warn('Received empty message from', source);
            return false;
        }

        let used_command = false;
        let effective_max_responses = max_responses;
        if (effective_max_responses === null) {
            effective_max_responses = settings.max_commands === -1 ? Infinity : settings.max_commands;
        }
        if (effective_max_responses === -1) {
            effective_max_responses = Infinity;
        }

        const self_prompt = source === 'system' || source === this.name;
        const from_other_bot = convoManager.isOtherAgent(source);

        if (!self_prompt && !from_other_bot) { // from user, check for forced commands
            const user_command_name = containsCommand(message);
            if (user_command_name) {
                if (!commandExists(user_command_name)) {
                    this.routeResponse(source, `Command '${user_command_name}' does not exist.`);
                    return false;
                }
                // Modified logic: Only echo command if not processing STT
                if (!this.isProcessingSTT) {
                    this.routeResponse(source, `*${source} used ${user_command_name.substring(1)}*`);
                }
                if (user_command_name === '!newAction') {
                    // all user-initiated commands are ignored by the bot except for this one
                    // add the preceding message to the history to give context for newAction
                    this.history.add(source, message);
                }
                let execute_res = await executeCommand(this, message);
                if (execute_res) 
                    this.routeResponse(source, execute_res);
                return true;
            }
        }

        if (from_other_bot)
            this.last_sender = source;

        // Now translate the message
        message = await handleEnglishTranslation(message);
        console.log('received message from', source, ':', message);

        const checkInterrupt = () => this.self_prompter.shouldInterrupt(self_prompt) || this.shut_up || convoManager.responseScheduledFor(source);
        
        let behavior_log = this.bot.modes.flushBehaviorLog().trim();
        if (behavior_log.length > 0) {
            const MAX_LOG = 500;
            if (behavior_log.length > MAX_LOG) {
                behavior_log = '...' + behavior_log.substring(behavior_log.length - MAX_LOG);
            }
            behavior_log = 'Recent behaviors log: \n' + behavior_log;
            await this.history.add('system', behavior_log);
        }

        // Handle other user messages
        await this.history.add(source, message);
        this.history.save();

        if (!self_prompt && this.self_prompter.isActive()) // message is from user during self-prompting
            effective_max_responses = 1; // force only respond to this message, then let self-prompting take over
        for (let i=0; i<effective_max_responses; i++) {
            if (checkInterrupt()) break;
            let history = this.history.getHistory();
            let res = await this.prompter.promptConvo(history);

            console.log(`${this.name} full response to ${source}: ""${res}""`);

            if (res.trim().length === 0) {
                console.warn('no response')
                break; // empty response ends loop
            }

            let command_name = containsCommand(res);

            if (command_name) { // contains query or command
                res = truncCommandMessage(res); // everything after the command is ignored
                this.history.add(this.name, res);
                
                if (!commandExists(command_name)) {
                    this.history.add('system', `Command ${command_name} does not exist.`);
                    console.warn('Agent hallucinated command:', command_name)
                    continue;
                }

                if (checkInterrupt()) break;
                this.self_prompter.handleUserPromptedCmd(self_prompt, isAction(command_name));

                // NEW LOGIC STARTS HERE
                // const isLLMSelfCommand = self_prompt; // self_prompt is (source === 'system' || source === this.name)

                if (self_prompt && settings.hideLLMCommands) {
                    // If it's an LLM command (self_prompt) and hideLLMCommands is true,
                    // do nothing here to send it to chat.
                    // The command is already in history and will be executed.
                    // Outputting to console for debugging/awareness that a hidden command is run.
                    console.log(`[${this.name}] Executing hidden command: ${res}`);
                } else {
                    // Original logic for showing commands if not hidden or not an LLM self-command
                    if (settings.verbose_commands) {
                        this.routeResponse(source, res);
                    }
                    else {
                        let pre_message = res.substring(0, res.indexOf(command_name)).trim();
                        let chat_message = `*used ${command_name.substring(1)}*`;
                        if (pre_message.length > 0)
                            chat_message = `${pre_message}  ${chat_message}`;
                        this.routeResponse(source, chat_message);
                    }
                }
                // NEW LOGIC ENDS HERE

                let execute_res = await executeCommand(this, res);

                console.log('Agent executed:', command_name, 'and got:', execute_res);
                used_command = true;

                if (execute_res)
                    this.history.add('system', execute_res);
                else
                    break;
            }
            else { // conversation response
                this.history.add(this.name, res);
                this.routeResponse(source, res);
                break;
            }
            
            this.history.save();
        }

        return used_command;
    }

    async routeResponse(to_player, message) {
        if (this.shut_up) return;
        let self_prompt = to_player === 'system' || to_player === this.name;
        if (self_prompt && this.last_sender) {
            // this is for when the agent is prompted by system while still in conversation
            // so it can respond to events like death but be routed back to the last sender
            to_player = this.last_sender;
        }

        if (convoManager.isOtherAgent(to_player) && convoManager.inConversation(to_player)) {
            // if we're in an ongoing conversation with the other bot, send the response to it
            convoManager.sendToBot(to_player, message);
        }
        else {
            // otherwise, use open chat
            this.openChat(message);
            // note that to_player could be another bot, but if we get here the conversation has ended
        }
    }

    async openChat(message) {
        let to_translate = message;
        let remaining = '';
        let command_name = containsCommand(message);
        let translate_up_to = command_name ? message.indexOf(command_name) : -1;
        if (translate_up_to != -1) { // don't translate the command
            to_translate = to_translate.substring(0, translate_up_to);
            remaining = message.substring(translate_up_to);
        }
        message = (await handleTranslation(to_translate)).trim() + " " + remaining;
        // newlines are interpreted as separate chats, which triggers spam filters. replace them with spaces
        message = message.replaceAll('\n', ' ');

        if (settings.only_chat_with.length > 0) {
            for (let username of settings.only_chat_with) {
                this.bot.whisper(username, message);
            }
        }
        else {
	    if (settings.speak) {
            say(to_translate);
	    }
            this.bot.chat(message);
        }
    }

    startEvents() {
        // Custom events
        this.bot.on('time', () => {
            if (this.bot.time.timeOfDay == 0)
            this.bot.emit('sunrise');
            else if (this.bot.time.timeOfDay == 6000)
            this.bot.emit('noon');
            else if (this.bot.time.timeOfDay == 12000)
            this.bot.emit('sunset');
            else if (this.bot.time.timeOfDay == 18000)
            this.bot.emit('midnight');
        });

        let prev_health = this.bot.health;
        this.bot.lastDamageTime = 0;
        this.bot.lastDamageTaken = 0;
        this.bot.on('health', () => {
            if (this.bot.health < prev_health) {
                this.bot.lastDamageTime = Date.now();
                this.bot.lastDamageTaken = prev_health - this.bot.health;
            }
            prev_health = this.bot.health;
        });
        // Logging callbacks
        this.bot.on('error' , (err) => {
            console.error('Error event!', err);
        });
        this.bot.on('end', (reason) => {
            console.warn('Bot disconnected! Killing agent process.', reason)
            this.cleanKill('Bot disconnected! Killing agent process.');
        });
        this.bot.on('death', () => {
            this.actions.cancelResume();
            this.actions.stop();
        });
        this.bot.on('kicked', (reason) => {
            console.warn('Bot kicked!', reason);
            this.cleanKill('Bot kicked! Killing agent process.');
        });
        this.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate && jsonMsg.translate.startsWith('death') && message.startsWith(this.name)) {
                console.log('Agent died: ', message);
                let death_pos = this.bot.entity.position;
                this.memory_bank.rememberPlace('last_death_position', death_pos.x, death_pos.y, death_pos.z);
                let death_pos_text = null;
                if (death_pos) {
                    death_pos_text = `x: ${death_pos.x.toFixed(2)}, y: ${death_pos.y.toFixed(2)}, z: ${death_pos.x.toFixed(2)}`;
                }
                let dimention = this.bot.game.dimension;
                this.handleMessage('system', `You died at position ${death_pos_text || "unknown"} in the ${dimention} dimension with the final message: '${message}'. Your place of death is saved as 'last_death_position' if you want to return. Previous actions were stopped and you have respawned.`);
            }
        });
        this.bot.on('idle', () => {
            this.bot.clearControlStates();
            this.bot.pathfinder.stop(); // clear any lingering pathfinder
            this.bot.modes.unPauseAll();
            this.actions.resumeAction();
        });

        // Init NPC controller
        this.npc.init();

        // This update loop ensures that each update() is called one at a time, even if it takes longer than the interval
        const INTERVAL = 300;
        let last = Date.now();
        setTimeout(async () => {
            while (true) {
                let start = Date.now();
                await this.update(start - last);
                let remaining = INTERVAL - (Date.now() - start);
                if (remaining > 0) {
                    await new Promise((resolve) => setTimeout(resolve, remaining));
                }
                last = start;
            }
        }, INTERVAL);

        this.bot.emit('idle');
    }

    async update(delta) {
        await this.bot.modes.update();
        this.self_prompter.update(delta);
        await this.checkTaskDone();
    }

    isIdle() {
        return !this.actions.executing;
    }
    

    cleanKill(msg='Killing agent process...', code=1) {
        this.history.add('system', msg);
        this.bot.chat(code > 1 ? 'Restarting.': 'Exiting.');
        this.history.save();
        process.exit(code);
    }
    async checkTaskDone() {
        if (this.task.data) {
            let res = this.task.isDone();
            if (res) {
                await this.history.add('system', `Task ended with score : ${res.score}`);
                await this.history.save();
                // await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 second for save to complete
                console.log('Task finished:', res.message);
                this.killAll();
            }
        }
    }

    killAll() {
        serverProxy.shutdown();
    }

    async initiateTeamDiscussion(originalUsername, originalMessage) {
        // Set up coordination context
        this.activeCoordinationContext = {
            originalUsername: originalUsername,
            originalMessage: originalMessage,
            teamSuggestions: {},
            status: 'awaiting_suggestions',
            receivedFrom: []
        };
        console.log(`[${this.name}] Coordinator context set. Awaiting team suggestions for message: "${originalMessage}"`);

        // Start timeout for suggestions
        const SUGGESTION_TIMEOUT_MS = 15000; // 15 seconds
        if (this.coordinationSuggestionTimeout) {
            clearTimeout(this.coordinationSuggestionTimeout); // Clear any existing timeout
        }
        this.coordinationSuggestionTimeout = setTimeout(() => {
            if (this.activeCoordinationContext && this.activeCoordinationContext.status === 'awaiting_suggestions') {
                console.log(`[${this.name}] Coordination suggestion period ended (timeout) for player message: "${this.activeCoordinationContext.originalMessage}". Received ${this.activeCoordinationContext.receivedFrom.length} suggestions.`);
                this.activeCoordinationContext.status = 'making_decision';
                this.processTeamSuggestionsAndDecide(); // Call decision making
                this.coordinationSuggestionTimeout = null;
            }
        }, SUGGESTION_TIMEOUT_MS);

        const inGameAgentNames = convoManager.getInGameAgents();
        const discussionMsg = `(TEAM_COORDINATION) Player '${originalUsername}' said: "${originalMessage}". Team, please analyze and suggest how we should respond or who should handle this.`;

        console.log(`[${this.name}] Broadcasting team discussion message: "${discussionMsg}"`);

        for (const agentName of inGameAgentNames) {
            if (agentName !== this.name) {
                try {
                    // convoManager.sendToBot expects a message package, not just a string.
                    // Adjusting to the { message: string, start: boolean } structure if that's what it expects,
                    // or simply the message string if that's acceptable for non-initial messages.
                    // For now, assuming it can handle a string directly for ongoing comms,
                    // or it internally wraps it. If not, this needs adjustment.
                    // Let's assume a simple string is fine for now as per existing convoManager.sendToBot examples.
                    convoManager.sendToBot(agentName, discussionMsg);
                    console.log(`[${this.name}] Relayed coordination message to ${agentName}.`);
                } catch (error) {
                    console.error(`[${this.name}] Failed to send coordination message to ${agentName}:`, error);
                }
            }
        }
    }

    async processTeamSuggestionsAndDecide() {
        if (!this.activeCoordinationContext || this.activeCoordinationContext.status !== 'making_decision') {
            console.error(`[${this.name}] processTeamSuggestionsAndDecide called in invalid state:`, this.activeCoordinationContext);
            if (this.activeCoordinationContext) this.activeCoordinationContext = null; // Attempt to reset
            return;
        }

        console.log(`[${this.name}] Coordinator processing team suggestions for player message: "${this.activeCoordinationContext.originalMessage}"`);
        const { originalUsername, originalMessage, teamSuggestions } = this.activeCoordinationContext;

        const allAgents = convoManager.getInGameAgents();
        const teamMembersString = allAgents.filter(name => name !== this.name).join(', ') || 'none';

        // Construct the decision-making prompt
        // Ensure no newlines in JSON string values if LLM is sensitive
        const decisionPromptText = `You are Coordinator ${this.name}. You are coordinating a response to player '${originalUsername}' who said: '${originalMessage}'. Your team (${teamMembersString}) provided these suggestions: ${JSON.stringify(teamSuggestions)}. Based on all this, decide: 1. What is the best course of action or response? 2. Which agent (you, '${this.name}', or one of '${teamMembersString}') is best suited? Respond ONLY with a JSON object like: {"chosen_agent": "AgentName", "action_summary": "Brief summary of what the chosen agent should do or say", "is_direct_response": true_or_false}`;

        console.log(`[${this.name}] Sending decision prompt to LLM: ${decisionPromptText}`);
        let decisionResponse;
        try {
            decisionResponse = await this.prompter.chat_model.sendRequest([], decisionPromptText); // No prior messages, just the system prompt
            console.log(`[${this.name}] Raw decision from LLM: ${decisionResponse}`);
        } catch (error) {
            console.error(`[${this.name}] Error getting decision from LLM:`, error);
            this.openChat(`Sorry ${originalUsername}, there was an error coordinating our team's response.`);
            this.activeCoordinationContext = null;
            return;
        }

        let parsedDecision;
        try {
            parsedDecision = JSON.parse(decisionResponse);
        } catch (error) {
            console.error(`[${this.name}] Error parsing JSON decision from LLM: "${decisionResponse}". Error:`, error);
            this.openChat(`Sorry ${originalUsername}, I had trouble deciding how our team should respond.`);
            this.activeCoordinationContext = null;
            return;
        }

        console.log(`[${this.name}] Parsed decision:`, parsedDecision);
        const { chosen_agent, action_summary, is_direct_response } = parsedDecision;

        if (!chosen_agent || !action_summary || typeof is_direct_response === 'undefined') {
            console.error(`[${this.name}] Invalid decision structure from LLM:`, parsedDecision);
            this.openChat(`Sorry ${originalUsername}, our team's decision process was unclear. Please try again.`);
            this.activeCoordinationContext = null;
            return;
        }

        // Ensure the chosen agent is valid
        if (chosen_agent !== this.name && !allAgents.includes(chosen_agent)) {
            console.error(`[${this.name}] LLM chose an invalid agent: '${chosen_agent}'. Defaulting to self.`);
            this.openChat(`Sorry ${originalUsername}, there was a mix-up in our team. I'll try to handle your request about "${originalMessage}" myself.`);
            // Fallback to Coordinator handling the original message directly
            this.handleMessage(originalUsername, originalMessage, { isCoordinatedAction: true });
            this.activeCoordinationContext = null;
            return;
        }


        if (chosen_agent === this.name) {
            console.log(`[${this.name}] Coordinator (${this.name}) is handling the request from ${originalUsername}.`);
            if (is_direct_response) {
                this.routeResponse(originalUsername, action_summary);
            } else {
                // Coordinator processes the original message, but now with context that it's a coordinated action
                this.handleMessage(originalUsername, originalMessage, { isCoordinatedAction: true });
            }
            this.activeCoordinationContext = null; // Coordination complete
        } else {
            console.log(`[${this.name}] Delegating task to ${chosen_agent} for player ${originalUsername}. Action: ${action_summary}`);
            const delegationMsg = `(EXECUTE_TASK) Player '${originalUsername}' (original message: '${originalMessage}') requested something. Our team (Coordinator: ${this.name}) decided you should handle it. Please proceed with: ${action_summary}. If this is a direct chat message, use /msg ${originalUsername} ${action_summary}. If it's a command, execute it.`;
            convoManager.sendToBot(chosen_agent, delegationMsg);

            // Optionally, update context for tracking, though current cycle ends here for Coordinator.
            // this.activeCoordinationContext.status = 'awaiting_execution';
            // this.activeCoordinationContext.delegatedTo = chosen_agent;
            // For now, just reset. A more complex system might track delegated task completion.
            this.activeCoordinationContext = null;
        }
         if (this.coordinationSuggestionTimeout) { // Should be null if cleared properly, but just in case.
            clearTimeout(this.coordinationSuggestionTimeout);
            this.coordinationSuggestionTimeout = null;
        }
    }

    async assessAndRoutePlayerMessage(originalPlayerUsername, originalPlayerMessage) {
        console.log(`[${this.name}] IPB assessing message from ${originalPlayerUsername}: "${originalPlayerMessage}"`);

        const onlineAgents = convoManager.getInGameAgents();
        const teamMembersString = onlineAgents.filter(name => name !== this.name).join(', ') || 'none';

        const assessmentPromptText = `You are agent ${this.name}. Player '${originalPlayerUsername}' said: '${originalPlayerMessage}'. Your online teammates are: ${teamMembersString}. Is this message: (a) A simple, direct task you (${this.name}) can handle alone immediately? (b) A simple task that should clearly be handled by another specific online teammate from ${teamMembersString} (if so, which one)? (c) A task that is vague, complex, or requires full team input/discussion? Respond ONLY with a JSON object like: {"assessment": "SELF_SIMPLE | OTHER_SIMPLE | TEAM_DISCUSS", "target_bot_if_other": "BotNameOrNullIfNone", "reason": "brief reason for your assessment"}`;

        let assessmentResponse;
        let parsedAssessment;

        try {
            assessmentResponse = await this.prompter.chat_model.sendRequest([], assessmentPromptText);
            console.log(`[${this.name}] Raw assessment from LLM: ${assessmentResponse}`);
            parsedAssessment = JSON.parse(assessmentResponse);
            console.log(`[${this.name}] Parsed assessment:`, parsedAssessment);
        } catch (error) {
            console.error(`[${this.name}] Error during LLM assessment or parsing:`, error);
            // Default to TEAM_DISCUSS on error
            parsedAssessment = { assessment: "TEAM_DISCUSS", reason: "Error during initial assessment." };
        }

        const defaultCoordinatorName = onlineAgents.length > 0 ? [...onlineAgents].sort()[0] : this.name; // Fallback to self if no agents somehow

        let assessmentType = parsedAssessment.assessment || "TEAM_DISCUSS"; // Default to team_discuss if assessment is missing

        switch (assessmentType) {
            case "SELF_SIMPLE":
                console.log(`[${this.name}] IPB assessed as SELF_SIMPLE. Handling directly. Reason: ${parsedAssessment.reason}`);
                if (this.name !== defaultCoordinatorName && onlineAgents.includes(defaultCoordinatorName)) {
                     // Inform the default coordinator if IPB is not the coordinator and is handling directly.
                    convoManager.sendToBot(defaultCoordinatorName, `(INFO_HANDLING_DIRECT_TASK) Player '${originalPlayerUsername}' said: '${originalPlayerMessage}'. IPB ${this.name} is handling it directly (self-assessed simple). Reason: ${parsedAssessment.reason}`);
                }
                await this.handleMessage(originalPlayerUsername, originalPlayerMessage, { isCoordinatedAction: true, isSelfAssessedSimple: true });
                break;
            case "OTHER_SIMPLE":
                const targetBot = parsedAssessment.target_bot_if_other;
                if (targetBot && onlineAgents.includes(targetBot)) {
                    console.log(`[${this.name}] IPB assessed as OTHER_SIMPLE. Delegating to ${targetBot}. Reason: ${parsedAssessment.reason}`);
                    const delegationMsg = `(EXECUTE_TASK) Player '${originalPlayerUsername}' (original message: '${originalPlayerMessage}') requested something. IPB ${this.name} assessed it as a simple task for you. Please proceed. Assessment reason: ${parsedAssessment.reason}`;
                    convoManager.sendToBot(targetBot, delegationMsg);

                    // Inform the default coordinator if IPB is not the coordinator and has delegated to another non-coordinator agent.
                    if (this.name !== defaultCoordinatorName && targetBot !== defaultCoordinatorName && onlineAgents.includes(defaultCoordinatorName)) {
                        convoManager.sendToBot(defaultCoordinatorName, `(INFO_DELEGATED_SIMPLE_TASK) For player '${originalPlayerUsername}' message '${originalPlayerMessage}', IPB ${this.name} delegated to ${targetBot} (assessed simple). Reason: ${parsedAssessment.reason}`);
                    }
                } else {
                    console.warn(`[${this.name}] IPB assessed as OTHER_SIMPLE but target_bot '${targetBot}' is invalid or offline. Defaulting to TEAM_DISCUSS. Original reason: ${parsedAssessment.reason}`);
                    // Fall-through to TEAM_DISCUSS
                    assessmentType = "TEAM_DISCUSS"; // Force this for the next block
                }
                break;
            // case "TEAM_DISCUSS" will be handled by the fall-through if not explicitly matched or if OTHER_SIMPLE failed
        }

        // This handles TEAM_DISCUSS either directly from assessment or as a fallback
        if (assessmentType === "TEAM_DISCUSS") {
             console.log(`[${this.name}] IPB assessed as TEAM_DISCUSS or defaulted. Reason: ${parsedAssessment.reason}. Initiating/Requesting full coordination.`);
            if (this.name === defaultCoordinatorName) { // IPB is the default Coordinator
                // Check if already coordinating this exact message to prevent re-initiation by self
                if (this.activeCoordinationContext &&
                    this.activeCoordinationContext.originalUsername === originalPlayerUsername &&
                    this.activeCoordinationContext.originalMessage === originalPlayerMessage &&
                    (this.activeCoordinationContext.status === 'awaiting_suggestions' || this.activeCoordinationContext.status === 'making_decision')) {
                    console.log(`[${this.name}] Default Coordinator assessed as TEAM_DISCUSS, but already coordinating this specific message. Not re-initiating.`);
                } else if (this.activeCoordinationContext) {
                     console.log(`[${this.name}] Default Coordinator assessed as TEAM_DISCUSS, but currently busy coordinating a different message ('${this.activeCoordinationContext.originalMessage}'). Player '${originalPlayerUsername}' may need to repeat their request if it's not picked up by another IPB.`);
                } else {
                    console.log(`[${this.name}] Default Coordinator IPB assessed as TEAM_DISCUSS. Initiating full coordination for '${originalPlayerMessage}'.`);
                    this.initiateTeamDiscussion(originalPlayerUsername, originalPlayerMessage);
                }
            } else { // IPB is not the default Coordinator, needs to request coordination
                 if (onlineAgents.includes(defaultCoordinatorName)) {
                    convoManager.sendToBot(defaultCoordinatorName, `(REQUEST_COORDINATION) Player '${originalPlayerUsername}' said: '${originalPlayerMessage}'. IPB ${this.name} assessed it as needing full team discussion. Please coordinate. Reason: ${parsedAssessment.reason}`);
                } else {
                    // Should not happen if onlineAgents has members, but as a safe fallback:
                    console.warn(`[${this.name}] Cannot request coordination, default coordinator ${defaultCoordinatorName} seems offline. Handling directly as fallback.`);
                    await this.handleMessage(originalPlayerUsername, originalPlayerMessage, { isCoordinatedAction: true, isSelfAssessedSimple: true });
                }
            }
        }
    }
}
