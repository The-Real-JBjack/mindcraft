import convoManager from './conversation.js'; // To get peer bot names
import { sendBotChatToServer } from './agent_proxy.js'; // For PASS actions

// Simple unique ID for messages passed between bots, if not already provided
let passMessageCounter = 0;

function generatePassMessageId() {
    return `pass-${Date.now()}-${passMessageCounter++}`;
}

class ResponsibilityHandler {
    constructor(agent) {
        this.agent = agent;
        if (!this.agent) {
            throw new Error("ResponsibilityHandler requires an agent instance during construction.");
        }
    }

    /**
     * Decides whether to respond, pass, or respond_and_pass, then acts.
     * @param {object} params
     * @param {string} params.messageId - Unique ID for the user's original message.
     * @param {string} params.username - The user who sent the message.
     * @param {string} params.message - The translated message content from the user.
     * @param {object[]} params.fullHistory - The conversation history so far.
     * @param {boolean} [params.isForced=false] - Whether this decision is forced.
     * @param {string} params.initialReceiverName - The name of the bot that first received this message.
     */
    async decideAndAct({ messageId, username, message, fullHistory, isForced = false, initialReceiverName = null }) {
        console.log(`${this.agent.name}: ResponsibilityHandler invoked for messageId '${messageId}' from '${username}'. isForced: ${isForced}, initialReceiver: ${initialReceiverName || 'N/A'}`);

        const peerBots = convoManager.getInGameAgents().filter(name => name !== this.agent.name);
        let actionPrompt = `You are ${this.agent.name}. A message from user '${username}' is: "${message}".
`;
        actionPrompt += `Your peer bots are: ${peerBots.join(', ') || 'none available'}.
`;
        actionPrompt += `The conversation history is:
${JSON.stringify(fullHistory.slice(-5), null, 2)}

`; // Show last 5 history entries

        if (isForced) {
            actionPrompt += `You were the initial receiver of this message, or responsibility has been passed back to you and no one else has handled it. You MUST act. Choose one of the following actions:
`;
            actionPrompt += `1.  FORCE_RESPOND: Generate a response to the user.
`;
            if (peerBots.length > 0) {
                actionPrompt += `2.  FORCE_PASS to <PeerBotName>: Force another bot to handle it. (e.g., "FORCE_PASS to ${peerBots[0]}")
`;
                actionPrompt += `3.  FORCE_RESPOND_AND_PASS to <PeerBotName>: Respond and also force another bot to handle any follow-up.
`;
            }
        } else {
            actionPrompt += `Choose one of the following actions:
`;
            actionPrompt += `1.  RESPOND: Generate a response to the user.
`;
            if (peerBots.length > 0) {
                actionPrompt += `2.  PASS to <PeerBotName>: Pass responsibility to a peer bot. (e.g., "PASS to ${peerBots[0]}")
`;
                actionPrompt += `3.  RESPOND_AND_PASS to <PeerBotName>: Respond and also pass to a peer bot for follow-up.
`;
            }
        }
        actionPrompt += `
Your decision (must start with ACTION: followed by one of the keywords like RESPOND, PASS to ..., etc.):`;

        console.log(`${this.agent.name}: Sending prompt to LLM for decision:
${actionPrompt}`);
        let llmDecisionStr = '';
        try {
            // Using a generic prompt structure; specific prompter might have different methods
            // This assumes prompter.prompt can take a direct string and returns a string.
            // We might need a dedicated prompter method for this structured decision.
            // For now, let's use a simplified approach if a direct prompting method isn't obvious.
            // This is a placeholder for actual LLM call.
            // In a real scenario, this would be:
            // llmDecisionStr = await this.agent.prompter.promptBasic(actionPrompt); // Or similar method

            // Placeholder LLM call for now - this needs to be replaced by actual call to agent's LLM
            console.warn(`${this.agent.name}: ResponsibilityHandler.decideAndAct - Using Placeholder LLM decision logic. Actual LLM call needed.`);
            if (isForced) {
                // If forced, primary action should be FORCE_RESPOND.
                // Allow simulated FORCE_PASS only if peers exist and for demonstration.
                if (peerBots.length > 0 && Math.random() < 0.25) { // Lower chance to FORCE_PASS for simulation
                    llmDecisionStr = `ACTION: FORCE_PASS to ${peerBots[0]}\nCOMMENT: Simulated forced pass.`;
                } else {
                    llmDecisionStr = "ACTION: FORCE_RESPOND\nRESPONSE: Okay, I am now handling this forced message.";
                }
            } else { // Not forced (initial interaction with the user by this agent)
                if (this.agent.prompter && typeof this.agent.prompter.promptConvo === 'function') {
                    if (peerBots.length > 0 && Math.random() < 0.3) { // ~30% chance to also pass to a peer
                        llmDecisionStr = `ACTION: RESPOND_AND_PASS to ${peerBots[0]}\nRESPONSE: I'll handle that and let ${peerBots[0]} know.`;
                    } else { // ~70% chance to just respond
                        llmDecisionStr = "ACTION: RESPOND\nRESPONSE: I'm on it!";
                    }
                } else {
                    console.error(`${this.agent.name}: Agent prompter not available or promptConvo not suitable for decision making. Defaulting non-forced to RESPOND.`);
                    // Fallback if prompter isn't available
                    if (peerBots.length > 0 && Math.random() < 0.3) {
                         llmDecisionStr = `ACTION: RESPOND_AND_PASS to ${peerBots[0]}\nRESPONSE: (Prompter Error) I will take care of this and inform ${peerBots[0]}.`;
                    } else {
                        llmDecisionStr = "ACTION: RESPOND\nRESPONSE: (Prompter Error) I will respond to this.";
                    }
                }
            }
            // Fallback if LLM (even placeholder) somehow produced nothing:
            if (!llmDecisionStr) {
                console.error(`${this.agent.name}: LLM decision string was empty. Defaulting.`);
                if (isForced) {
                    llmDecisionStr = "ACTION: FORCE_RESPOND\nRESPONSE: Defaulting to forced response due to empty LLM output.";
                } else {
                    llmDecisionStr = "ACTION: RESPOND\nRESPONSE: Defaulting to response due to empty LLM output.";
                }
            }

            console.log(`${this.agent.name}: LLM decision received: "${llmDecisionStr}"`);
        } catch (error) {
            console.error(`${this.agent.name}: Error calling LLM for decision:`, error);
            llmDecisionStr = "ACTION: RESPOND\nRESPONSE: (Error during LLM decision) I will respond to this."; // Fallback
        }

        // Parse LLM decision
        const lines = llmDecisionStr.split('\n');
        let action = null;
        let targetBot = null;
        let responseText = null;

        for (const line of lines) {
            if (line.startsWith("ACTION:")) {
                const actionPart = line.substring("ACTION:".length).trim();
                if (actionPart.startsWith("PASS to ")) {
                    action = "PASS";
                    targetBot = actionPart.substring("PASS to ".length).trim();
                } else if (actionPart.startsWith("RESPOND_AND_PASS to ")) {
                    action = "RESPOND_AND_PASS";
                    targetBot = actionPart.substring("RESPOND_AND_PASS to ".length).trim();
                } else if (actionPart.startsWith("FORCE_PASS to ")) {
                    action = "FORCE_PASS";
                    targetBot = actionPart.substring("FORCE_PASS to ".length).trim();
                } else if (actionPart.startsWith("FORCE_RESPOND_AND_PASS to ")) {
                    action = "FORCE_RESPOND_AND_PASS";
                    targetBot = actionPart.substring("FORCE_RESPOND_AND_PASS to ".length).trim();
                } else if (actionPart === "RESPOND" || actionPart === "FORCE_RESPOND") {
                    action = actionPart;
                }
            } else if (line.startsWith("TARGET_BOT:")) { // Alternative way to specify target
                targetBot = line.substring("TARGET_BOT:".length).trim();
            } else if (line.startsWith("RESPONSE:")) {
                responseText = line.substring("RESPONSE:".length).trim();
            } else if (action && (action.includes("RESPOND")) && !responseText) {
                // If action is RESPOND/FORCE_RESPOND and RESPONSE: line hasn't been found yet,
                // assume this line is the start of the response.
                responseText = line.trim();
            } else if (responseText) {
                // Append to multi-line response
                responseText += "\n" + line.trim();
            }
        }

        // If LLM only provides action like "RESPOND" and the response on subsequent lines without "RESPONSE:" prefix.
        if ((action === "RESPOND" || action === "FORCE_RESPOND" || action === "RESPOND_AND_PASS" || action === "FORCE_RESPOND_AND_PASS") && !responseText && lines.length > 1 && lines[0].startsWith("ACTION:")) {
            responseText = lines.slice(1).join("\n").trim();
        }


        console.log(`${this.agent.name}: Parsed action: ${action}, Target: ${targetBot || 'N/A'}, Response: ${responseText || 'N/A'}`);

        // --- Execute Action ---
        const messageDetailsForPassing = {
            originalMessageId: messageId, // ID of the original user message
            passMessageId: generatePassMessageId(), // Unique ID for this specific pass event
            username: username, // Original user
            message: message, // Original message from user
            fullHistory: fullHistory, // Pass history
            initialReceiverName: initialReceiverName || this.agent.name // Who got it first from user
        };

        if (action === "RESPOND" || action === "FORCE_RESPOND") {
            if (responseText) {
                // Agent needs to say this responseText in public chat.
                // handleMessage typically generates its own response via LLM.
                // We need a way for the agent to just say something.
                console.log(`${this.agent.name}: Executing RESPOND. Saying: "${responseText}"`);
                this.agent.openChat(responseText); // Assumes agent has openChat method
                // Also add this bot's response to its own history.
                await this.agent.history.add(this.agent.name, responseText);
                this.agent.history.save();
                // After initial response, process the message
                await this.agent.handleMessage(username, message);
            } else {
                console.warn(`${this.agent.name}: Action was RESPOND but no responseText found. Calling handleMessage as fallback.`);
                await this.agent.handleMessage(username, message); // Fallback to full handleMessage
            }
        } else if ((action === "PASS" || action === "FORCE_PASS") && targetBot) {
            if (peerBots.includes(targetBot)) {
                console.log(`${this.agent.name}: Executing PASS to ${targetBot}.`);
                sendBotChatToServer(targetBot, {
                    type: "PASS_RESPONSIBILITY",
                    fromBot: this.agent.name,
                    // toBot: targetBot, // Implicit in sendBotChatToServer's first arg
                    messageDetails: messageDetailsForPassing
                });
            } else {
                console.error(`${this.agent.name}: Invalid target bot '${targetBot}' for PASS. Responding as fallback.`);
                await this.agent.handleMessage(username, message);
            }
        } else if ((action === "RESPOND_AND_PASS" || action === "FORCE_RESPOND_AND_PASS") && targetBot) {
            if (responseText) {
                console.log(`${this.agent.name}: Executing RESPOND_AND_PASS to ${targetBot}. Saying: "${responseText}"`);
                this.agent.openChat(responseText);
                await this.agent.history.add(this.agent.name, responseText);
                this.agent.history.save();
                // After initial response, process the message
                await this.agent.handleMessage(username, message);
            } else {
                console.warn(`${this.agent.name}: Action was RESPOND_AND_PASS but no responseText. Responding via handleMessage as fallback.`);
                await this.agent.handleMessage(username, message); // Respond part
            }
            if (peerBots.includes(targetBot)) {
                console.log(`${this.agent.name}: Completing RESPOND_AND_PASS by passing to ${targetBot}.`);
                 sendBotChatToServer(targetBot, {
                    type: "PASS_RESPONSIBILITY",
                    fromBot: this.agent.name,
                    messageDetails: messageDetailsForPassing
                });
            } else {
                console.error(`${this.agent.name}: Invalid target bot '${targetBot}' for RESPOND_AND_PASS. Only responded.`);
            }
        } else {
            console.warn(`${this.agent.name}: Could not parse a valid action from LLM response. Defaulting to RESPOND.`);
            await this.agent.handleMessage(username, message);
        }
    }
}

export default ResponsibilityHandler;
