import * as skills from '../library/skills.js';
import * as baritoneClient from '../../baritone_client.js'; // Added Baritone client
import settings from '../../../settings.js';
import convoManager from '../conversation.js';


function runAsAction (actionFn, resume = false, timeout = -1) {
    let actionLabel = null;  // Will be set on first use
    
    const wrappedAction = async function (agent, ...args) {
        // Set actionLabel only once, when the action is first created
        if (!actionLabel) {
            const actionObj = actionsList.find(a => a.perform === wrappedAction);
            actionLabel = actionObj.name.substring(1); // Remove the ! prefix
        }

        const actionFnWithAgent = async () => {
            await actionFn(agent, ...args);
        };
        const code_return = await agent.actions.runAction(`action:${actionLabel}`, actionFnWithAgent, { timeout, resume });
        if (code_return.interrupted && !code_return.timedout)
            return;
        return code_return.message;
    }

    return wrappedAction;
}

export const actionsList = [
    {
        name: '!newAction',
        description: 'Perform new and unknown custom behaviors that are not available as a command.', 
        params: {
            'prompt': { type: 'string', description: 'A natural language prompt to guide code generation. Make a detailed step-by-step plan.' }
        },
        perform: async function(agent, prompt) {
            // just ignore prompt - it is now in context in chat history
            if (!settings.allow_insecure_coding) { 
                agent.openChat('newAction is disabled. Enable with allow_insecure_coding=true in settings.js');
                return "newAction not allowed! Code writing is disabled in settings. Notify the user.";
            }
            let result = "";
            const actionFn = async () => {
                try {
                    result = await agent.coder.generateCode(agent.history);
                } catch (e) {
                    result = 'Error generating code: ' + e.toString();
                }
            };
            await agent.actions.runAction('action:newAction', actionFn);
            return result;
        }
    },
    {
        name: '!stop',
        description: 'Force stop all actions and commands that are currently executing.',
        perform: async function (agent) {
            await agent.actions.stop(); // This handles internal bot stop
            try {
                await baritoneClient.stop(); // Call Baritone's stop API
                skills.log(agent.bot, "Baritone stop command issued.");
            } catch (e) {
                skills.log(agent.bot, `Error calling Baritone stop: ${e.message}`);
                // Decide if this error should be re-thrown or just logged
            }
            agent.clearBotLogs();
            agent.actions.cancelResume();
            agent.bot.emit('idle');
            let msg = 'Agent and Baritone stop commands issued.';
            if (agent.self_prompter.isActive())
                msg += ' Self-prompting still active.';
            return msg;
        }
    },
    {
        name: '!stfu',
        description: 'Stop all chatting and self prompting, but continue current action.',
        perform: async function (agent) {
            agent.openChat('Shutting up.');
            agent.shutUp();
            return;
        }
    },
    {
        name: '!restart',
        description: 'Restart the agent process.',
        perform: async function (agent) {
            agent.cleanKill();
        }
    },
    {
        name: '!clearChat',
        description: 'Clear the chat history.',
        perform: async function (agent) {
            agent.history.clear();
            return agent.name + "'s chat history was cleared, starting new conversation from scratch.";
        }
    },
    {
        name: '!goToPlayer',
        description: 'Go to the given player.',
        params: {
            'player_name': {type: 'string', description: 'The name of the player to go to.'},
            'closeness': {type: 'float', description: 'How close to get to the player.', domain: [0, Infinity]}
        },
        perform: runAsAction(async (agent, player_name, closeness) => {
            await skills.goToPlayer(agent.bot, player_name, closeness);
        })
    },
    {
        name: '!followPlayer',
        description: 'Endlessly follow the given player.',
        params: {
            'player_name': {type: 'string', description: 'name of the player to follow.'},
            'follow_dist': {type: 'float', description: 'The distance to follow from.', domain: [0, Infinity]}
        },
        perform: runAsAction(async (agent, player_name, follow_dist) => {
            // follow_dist might be handled by Baritone settings, not as a per-call param.
            skills.log(agent.bot, `Action: followPlayer (player: ${player_name}, dist: ${follow_dist}) using Baritone.`);
            const player = agent.bot.players[player_name]?.entity;
            if (player) {
                // Assuming Baritone needs an entity ID. Player username is often a good ID.
                const entityId = player.username || String(player.id); // Use username if available
                await baritoneClient.followEntity(entityId);
                skills.log(agent.bot, `Baritone followEntity(${entityId}) command issued.`);
            } else {
                skills.log(agent.bot, `Player ${player_name} not found to follow with Baritone.`);
                throw new Error(`Player ${player_name} not found.`);
            }
        }, true) // true for resumable action
    },
    {
        name: '!goToCoordinates',
        description: 'Go to the given x, y, z location.',
        params: {
            'x': {type: 'float', description: 'The x coordinate.', domain: [-Infinity, Infinity]},
            'y': {type: 'float', description: 'The y coordinate.', domain: [-64, 320]},
            'z': {type: 'float', description: 'The z coordinate.', domain: [-Infinity, Infinity]},
            'closeness': {type: 'float', description: 'How close to get to the location.', domain: [0, Infinity]}
        },
        perform: runAsAction(async (agent, x, y, z, closeness) => {
            // closeness is not directly used by our current baritoneClient.goTo, but Baritone might have its own setting.
            // closeness is not directly used by our current baritoneClient.goTo, but Baritone might have its own setting.
            skills.log(agent.bot, `Action: goToCoordinates ${x}, ${y}, ${z} (closeness: ${closeness}) using Baritone.`);
            try {
                const response = await baritoneClient.goTo(x, y, z);
                // Assuming 'response' from baritoneClient.goTo is the parsed JSON object
                // If Baritone sends a specific success message, we can use it. e.g. response.message
                let successMessage = `Baritone reports: Successfully initiated navigation to (${x}, ${y}, ${z}).`;
                if (response && response.message) {
                    successMessage = `Baritone reports: "${response.message}" for navigation to (${x}, ${y}, ${z}).`;
                } else if (response && response.status) { // Fallback if no message but status exists
                    successMessage = `Baritone status "${response.status}" for navigation to (${x}, ${y}, ${z}).`;
                }
                skills.log(agent.bot, successMessage);
                return successMessage; // This message will be returned by runAsAction
            } catch (error) {
                skills.log(agent.bot, `Baritone navigation to (${x}, ${y}, ${z}) failed: ${error.message}`);
                // The error will be caught by ActionManager and reported.
                // We can also return a specific failure message string if preferred,
                // but throwing the error provides more detail to ActionManager.
                // To ensure a custom message is part of the agent's history via runAsAction:
                throw new Error(`Baritone navigation to (${x}, ${y}, ${z}) failed: ${error.message}`);
            }
        })
    },
    {
        name: '!searchForBlock',
        description: 'Find and go to the nearest block of a given type in a given range.',
        params: {
            'type': { type: 'BlockName', description: 'The block type to go to.' },
            'search_range': { type: 'float', description: 'The range to search for the block.', domain: [32, 512] }
        },
        perform: runAsAction(async (agent, block_type, range) => {
            await skills.goToNearestBlock(agent.bot, block_type, 4, range);
        })
    },
    {
        name: '!searchForEntity',
        description: 'Find and go to the nearest entity of a given type in a given range.',
        params: {
            'type': { type: 'string', description: 'The type of entity to go to.' },
            'search_range': { type: 'float', description: 'The range to search for the entity.', domain: [32, 512] }
        },
        perform: runAsAction(async (agent, entity_type, range) => {
            await skills.goToNearestEntity(agent.bot, entity_type, 4, range);
        })
    },
    {
        name: '!moveAway',
        description: 'Move away from the current location in any direction by a given distance.',
        params: {'distance': { type: 'float', description: 'The distance to move away.', domain: [0, Infinity] }},
        perform: runAsAction(async (agent, distance) => {
            await skills.moveAway(agent.bot, distance);
        })
    },
    {
        name: '!rememberHere',
        description: 'Save the current location with a given name.',
        params: {'name': { type: 'string', description: 'The name to remember the location as.' }},
        perform: async function (agent, name) {
            const pos = agent.bot.entity.position;
            agent.memory_bank.rememberPlace(name, pos.x, pos.y, pos.z);
            return `Location saved as "${name}".`;
        }
    },
    {
        name: '!goToRememberedPlace',
        description: 'Go to a saved location.',
        params: {'name': { type: 'string', description: 'The name of the location to go to.' }},
        perform: runAsAction(async (agent, name) => {
            const pos = agent.memory_bank.recallPlace(name);
            if (!pos) {
            skills.log(agent.bot, `No location named "${name}" saved.`);
            return;
            }
            await skills.goToPosition(agent.bot, pos[0], pos[1], pos[2], 1);
        })
    },
    {
        name: '!givePlayer',
        description: 'Give the specified item to the given player.',
        params: { 
            'player_name': { type: 'string', description: 'The name of the player to give the item to.' }, 
            'item_name': { type: 'ItemName', description: 'The name of the item to give.' },
            'num': { type: 'int', description: 'The number of items to give.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, player_name, item_name, num) => {
            await skills.giveToPlayer(agent.bot, item_name, player_name, num);
        })
    },
    {
        name: '!consume',
        description: 'Eat/drink the given item.',
        params: {'item_name': { type: 'ItemName', description: 'The name of the item to consume.' }},
        perform: runAsAction(async (agent, item_name) => {
            await skills.consume(agent.bot, item_name);
        })
    },
    {
        name: '!equip',
        description: 'Equip the given item.',
        params: {'item_name': { type: 'ItemName', description: 'The name of the item to equip.' }},
        perform: runAsAction(async (agent, item_name) => {
            await skills.equip(agent.bot, item_name);
        })
    },
    {
        name: '!putInChest',
        description: 'Put the given item in the nearest chest.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to put in the chest.' },
            'num': { type: 'int', description: 'The number of items to put in the chest.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            await skills.putInChest(agent.bot, item_name, num);
        })
    },
    {
        name: '!takeFromChest',
        description: 'Take the given items from the nearest chest.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to take.' },
            'num': { type: 'int', description: 'The number of items to take.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            await skills.takeFromChest(agent.bot, item_name, num);
        })
    },
    {
        name: '!viewChest',
        description: 'View the items/counts of the nearest chest.',
        params: { },
        perform: runAsAction(async (agent) => {
            await skills.viewChest(agent.bot);
        })
    },
    {
        name: '!discard',
        description: 'Discard the given item from the inventory.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to discard.' },
            'num': { type: 'int', description: 'The number of items to discard.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            const start_loc = agent.bot.entity.position;
            await skills.moveAway(agent.bot, 5);
            await skills.discard(agent.bot, item_name, num);
            await skills.goToPosition(agent.bot, start_loc.x, start_loc.y, start_loc.z, 0);
        })
    },
    {
        name: '!collectBlocks',
        description: 'Collect the nearest blocks of a given type.',
        params: {
            'type': { type: 'BlockName', description: 'The block type to collect.' },
            'num': { type: 'int', description: 'The number of blocks to collect.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, type, num) => {
            // This action is more complex. Original `skills.collectBlock` likely involves:
            // 1. Finding appropriate blocks.
            // 2. Pathfinding to them one by one.
            // 3. Mining them.
            // Our current `baritoneClient.mineBlock(x,y,z)` is for a specific coordinate.
            // A more robust solution would involve:
            //    a. A Baritone API to find blocks of a certain type (e.g., /findBlock?type=dirt)
            //    b. Then, iterating `num` times, get coordinates and call `baritoneClient.mineBlock(x,y,z)`.
            // OR Baritone might have a command like /mineBlocks?type=dirt&count=num
            // For now, let's try to find ONE block of the type and ask Baritone to mine it.
            // This simplification means 'num' is not fully supported yet.
            skills.log(agent.bot, `Action: collectBlocks (type: ${type}, num: ${num}) using Baritone. Simplified to mine one block.`);

            // Step 1: Find the nearest block of the given type (using existing skill, IF it doesn't move the bot)
            // This is a placeholder; ideally, Baritone provides this or it's done without mineflayer pathfinding.
            // For now, we'll assume we need specific coordinates.
            // If skills.findNearestBlock is available and suitable:
            const block = skills.findNearestBlock(agent.bot, type, agent.bot.entity.position, 64); // Example range
            if (block) {
                skills.log(agent.bot, `Found block of type ${type} at ${block.position}. Telling Baritone to mine it.`);
                await baritoneClient.mineBlock(block.position.x, block.position.y, block.position.z);
                skills.log(agent.bot, `Baritone mineBlock(${block.position.x}, ${block.position.y}, ${block.position.z}) command issued for type ${type}.`);
                // We would need a loop and re-finding for 'num > 1'
                if (num > 1) {
                    skills.log(agent.bot, `Note: Mining multiple blocks (${num}) is not fully implemented with Baritone yet. Mined one.`);
                }
            } else {
                skills.log(agent.bot, `Could not find any blocks of type ${type} nearby to mine with Baritone.`);
                throw new Error(`No blocks of type ${type} found nearby.`);
            }
        }, false, 10) // 10 minute timeout
    },
    {
        name: '!craftRecipe',
        description: 'Craft the given recipe a given number of times.',
        params: {
            'recipe_name': { type: 'ItemName', description: 'The name of the output item to craft.' },
            'num': { type: 'int', description: 'The number of times to craft the recipe. This is NOT the number of output items, as it may craft many more items depending on the recipe.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, recipe_name, num) => {
            await skills.craftRecipe(agent.bot, recipe_name, num);
        })
    },
    {
        name: '!smeltItem',
        description: 'Smelt the given item the given number of times.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the input item to smelt.' },
            'num': { type: 'int', description: 'The number of times to smelt the item.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            let success = await skills.smeltItem(agent.bot, item_name, num);
            if (success) {
                setTimeout(() => {
                    agent.cleanKill('Safely restarting to update inventory.');
                }, 500);
            }
        })
    },
    {
        name: '!clearFurnace',
        description: 'Take all items out of the nearest furnace.',
        params: { },
        perform: runAsAction(async (agent) => {
            await skills.clearNearestFurnace(agent.bot);
        })
    },
        {
        name: '!placeHere',
        description: 'Place a given block in the current location. Do NOT use to build structures, only use for single blocks/torches.',
        params: {'type': { type: 'BlockName', description: 'The block type to place.' }},
        perform: runAsAction(async (agent, type) => {
            // Assuming 'type' is a block name like "minecraft:dirt"
            // The current !placeHere places at the bot's current feet, which might not be ideal.
            // Baritone's placeBlock likely needs a specific target coordinate.
            // Let's try placing at the block directly in front of the bot's feet.
            const botPos = agent.bot.entity.position;
            const targetPos = botPos.offset(0, -1, 0).floored(); // Block at feet. For placement, might want one block away.
            // For simplicity, let's assume the user means to place at specified coordinates or a GUI selects it.
            // This action needs better definition for Baritone.
            // Let's assume for now it means placing at bot's feet if no other coords given.
            // The 'type' from params should be the blockType string.
            skills.log(agent.bot, `Action: placeBlock (type: ${type}) at current bot feet using Baritone.`);
            await baritoneClient.placeBlock(type, targetPos.x, targetPos.y, targetPos.z);
            skills.log(agent.bot, `Baritone placeBlock(${type}, ${targetPos.x}, ${targetPos.y}, ${targetPos.z}) command issued.`);
        })
    },
    {
        name: '!attack',
        description: 'Attack and kill the nearest entity of a given type.',
        params: {'type': { type: 'string', description: 'The type of entity to attack.'}},
        perform: runAsAction(async (agent, type) => {
            // This is complex. `skills.attackNearest` finds then attacks.
            // `baritoneClient.attackEntity` needs an entityId.
            // We need a way to get entityId from type.
            // Placeholder: find entity using mineflayer (if possible without conflicting with Baritone) then attack.
            skills.log(agent.bot, `Action: attack (type: ${type}) using Baritone. Finding entity first.`);
            const entity = agent.bot.nearestEntity(e => e.name === type || e.displayName === type); // Example find logic
            if (entity) {
                skills.log(agent.bot, `Found entity ${type} with ID ${entity.id}. Telling Baritone to attack.`);
                // We need a persistent or recognizable entityId for Baritone. Mineflayer's entity.id might be runtime specific.
                // This is a placeholder for how an entityId would be obtained.
                // Let's assume entity.id or entity.username for players is what Baritone expects.
                const entityId = entity.id || entity.username;
                if (entityId) {
                    await baritoneClient.attackEntity(String(entityId)); // Ensure it's a string
                    skills.log(agent.bot, `Baritone attackEntity(${entityId}) command issued for type ${type}.`);
                } else {
                    skills.log(agent.bot, `Could not determine a suitable entity ID for ${type}.`);
                    throw new Error(`Could not determine ID for entity ${type}.`);
                }
            } else {
                skills.log(agent.bot, `Could not find any entity of type ${type} nearby to attack with Baritone.`);
                throw new Error(`No entity of type ${type} found nearby.`);
            }
        })
    },
    {
        name: '!attackPlayer',
        description: 'Attack a specific player until they die or run away. Remember this is just a game and does not cause real life harm.',
        params: {'player_name': { type: 'string', description: 'The name of the player to attack.'}},
        perform: runAsAction(async (agent, player_name) => {
            let player = agent.bot.players[player_name]?.entity;
            if (!player) {
                skills.log(agent.bot, `Could not find player ${player_name}.`);
                return false;
            }
            await skills.attackEntity(agent.bot, player, true);
        })
    },
    {
        name: '!goToBed',
        description: 'Go to the nearest bed and sleep.',
        perform: runAsAction(async (agent) => {
            await skills.goToBed(agent.bot);
        })
    },
    {
        name: '!activate',
        description: 'Activate the nearest object of a given type.',
        params: {'type': { type: 'BlockName', description: 'The type of object to activate.' }},
        perform: runAsAction(async (agent, type) => {
            // This action is specifically for blocks.
            skills.log(agent.bot, `Action: activate (type: ${type}) using Baritone. Attempting to interactWithBlock for nearest block of this type.`);
            const block = skills.findNearestBlock(agent.bot, type, agent.bot.entity.position, 10); // Search within 10 blocks
            if (block) {
                skills.log(agent.bot, `Found block of type ${type} at ${block.position}. Telling Baritone to interactWithBlock.`);
                await baritoneClient.interactWithBlock(block.position.x, block.position.y, block.position.z);
                skills.log(agent.bot, `Baritone interactWithBlock(${block.position.x},${block.position.y},${block.position.z}) command issued for block type ${type}.`);
            } else {
                skills.log(agent.bot, `Could not find any block of type ${type} nearby to activate with Baritone.`);
                throw new Error(`No block of type ${type} found nearby to interact with.`);
            }
        })
    },
    {
        name: '!killNearbyHostiles',
        description: 'Automatically find and attack nearby hostile mobs.',
        params: {},
        perform: runAsAction(async (agent) => {
            skills.log(agent.bot, `Action: killNearbyHostiles using Baritone.`);
            await baritoneClient.killHostileMobs();
            skills.log(agent.bot, `Baritone killHostileMobs command issued.`);
        })
    },
    {
        name: '!defendTarget',
        description: 'Defend a specified target entity (player or mob) by attacking mobs that target it.',
        params: { 'target_entity_id': { type: 'string', description: 'The ID or name of the entity to defend.' } },
        perform: runAsAction(async (agent, target_entity_id) => {
            // Note: Baritone might need a way to resolve entity names to IDs if not already an ID.
            // For now, assumes target_entity_id is what Baritone expects.
            skills.log(agent.bot, `Action: defendTarget (target: ${target_entity_id}) using Baritone.`);
            const targetEntity = agent.bot.nearestEntity(e => String(e.id || e.username) === target_entity_id); // Attempt to find/validate
            if (targetEntity) {
                await baritoneClient.defend(target_entity_id); // Pass the original ID/name
                skills.log(agent.bot, `Baritone defend(${target_entity_id}) command issued.`);
            } else {
                // Optional: check if target_entity_id refers to a player by name if not found as an entity ID
                const player = agent.bot.players[target_entity_id]?.entity;
                if (player) {
                    await baritoneClient.defend(target_entity_id); // Assuming Baritone can take player name
                    skills.log(agent.bot, `Baritone defend(${target_entity_id}) command issued for player.`);
                } else {
                    skills.log(agent.bot, `Target entity ${target_entity_id} not found nearby to defend with Baritone.`);
                    throw new Error(`Target entity ${target_entity_id} not found.`);
                }
            }
        })
    },
    {
        name: '!interactWithEntity',
        description: 'Interact with a specified entity (e.g., trade with villager, shear sheep).',
        params: { 'target_entity_id': { type: 'string', description: 'The ID or name of the entity to interact with.' } },
        perform: runAsAction(async (agent, target_entity_id) => {
            skills.log(agent.bot, `Action: interactWithEntity (target: ${target_entity_id}) using Baritone.`);
            const targetEntity = agent.bot.nearestEntity(e => String(e.id || e.username) === target_entity_id);
            if (targetEntity) {
                await baritoneClient.interactWithEntity(target_entity_id);
                skills.log(agent.bot, `Baritone interactWithEntity(${target_entity_id}) command issued.`);
            } else {
                const player = agent.bot.players[target_entity_id]?.entity;
                if (player) {
                    await baritoneClient.interactWithEntity(target_entity_id);
                    skills.log(agent.bot, `Baritone interactWithEntity(${target_entity_id}) command issued for player.`);
                } else {
                    skills.log(agent.bot, `Target entity ${target_entity_id} not found nearby to interact with Baritone.`);
                    throw new Error(`Target entity ${target_entity_id} not found.`);
                }
            }
        })
    },
    {
        name: '!stay',
        description: 'Stay in the current location no matter what. Pauses all modes.',
        params: {'type': { type: 'int', description: 'The number of seconds to stay. -1 for forever.', domain: [-1, Number.MAX_SAFE_INTEGER] }},
        perform: runAsAction(async (agent, seconds) => {
            await skills.stay(agent.bot, seconds);
        })
    },
    {
        name: '!setMode',
        description: 'Set a mode to on or off. A mode is an automatic behavior that constantly checks and responds to the environment.',
        params: {
            'mode_name': { type: 'string', description: 'The name of the mode to enable.' },
            'on': { type: 'boolean', description: 'Whether to enable or disable the mode.' }
        },
        perform: async function (agent, mode_name, on) {
            const modes = agent.bot.modes;
            if (!modes.exists(mode_name))
            return `Mode ${mode_name} does not exist.` + modes.getDocs();
            if (modes.isOn(mode_name) === on)
            return `Mode ${mode_name} is already ${on ? 'on' : 'off'}.`;
            modes.setOn(mode_name, on);
            return `Mode ${mode_name} is now ${on ? 'on' : 'off'}.`;
        }
    },
    {
        name: '!goal',
        description: 'Set a goal prompt to endlessly work towards with continuous self-prompting.',
        params: {
            'selfPrompt': { type: 'string', description: 'The goal prompt.' },
        },
        perform: async function (agent, prompt) {
            if (convoManager.inConversation()) {
                agent.self_prompter.setPromptPaused(prompt);
            }
            else {
                agent.self_prompter.start(prompt);
            }
        }
    },
    {
        name: '!endGoal',
        description: 'Call when you have accomplished your goal. It will stop self-prompting and the current action. ',
        perform: async function (agent) {
            agent.self_prompter.stop();
            return 'Self-prompting stopped.';
        }
    },
    {
        name: '!startConversation',
        description: 'Start a conversation with a player. Use for bots only.',
        params: {
            'player_name': { type: 'string', description: 'The name of the player to send the message to.' },
            'message': { type: 'string', description: 'The message to send.' },
        },
        perform: async function (agent, player_name, message) {
            if (!convoManager.isOtherAgent(player_name))
                return player_name + ' is not a bot, cannot start conversation.';
            if (convoManager.inConversation() && !convoManager.inConversation(player_name)) 
                convoManager.forceEndCurrentConversation();
            else if (convoManager.inConversation(player_name))
                agent.history.add('system', 'You are already in conversation with ' + player_name + '. Don\'t use this command to talk to them.');
            convoManager.startConversation(player_name, message);
        }
    },
    {
        name: '!endConversation',
        description: 'End the conversation with the given player.',
        params: {
            'player_name': { type: 'string', description: 'The name of the player to end the conversation with.' }
        },
        perform: async function (agent, player_name) {
            if (!convoManager.inConversation(player_name))
                return `Not in conversation with ${player_name}.`;
            convoManager.endConversation(player_name);
            return `Converstaion with ${player_name} ended.`;
        }
    },
    {
        name: '!lookAtPlayer',
        description: 'Look at a player or look in the same direction as the player.',
        params: {
            'player_name': { type: 'string', description: 'Name of the target player' },
            'direction': {
                type: 'string',
                description: 'How to look ("at": look at the player, "with": look in the same direction as the player)',
            }
        },
        perform: async function(agent, player_name, direction) {
            // This uses vision_interpreter, which might be fine.
            // However, if Baritone has a lookAtPlayer, we could use that.
            // For now, assuming this remains as is, or Baritone's lookAt(x,y,z) is preferred.
            // If we want Baritone to look at a player, we'd need player's coords.
            if (direction !== 'at' && direction !== 'with') {
                return "Invalid direction. Use 'at' or 'with'.";
            }
            // If 'at', get player coords and use baritoneClient.lookAt(x,y,z)
            const player = agent.bot.players[player_name]?.entity;
            if (direction === 'at' && player) {
                skills.log(agent.bot, `Action: lookAtPlayer (player: ${player_name}, direction: ${direction}) using Baritone.`);
                await baritoneClient.lookAt(player.position.x, player.position.y + player.height, player.position.z); // Look at player's head
                return `Looking at ${player_name} using Baritone.`;
            } else if (direction === 'with' && player) {
                // This is more complex: "look in the same direction as the player"
                // Would require getting player's yaw/pitch and setting bot's look similarly.
                // Baritone might not have a direct "lookWith" API. Sticking to current implementation for "with".
                // Or, we could make Baritone look at a point far in front of the player.
                skills.log(agent.bot, `Action: lookAtPlayer (player: ${player_name}, direction: ${direction}) - 'with' direction not yet fully Baritone-fied. Using vision_interpreter.`);
                let result = "";
                const actionFn = async () => {
                    result = await agent.vision_interpreter.lookAtPlayer(player_name, direction);
                };
                await agent.actions.runAction('action:lookAtPlayer', actionFn);
                return result;
            } else if (!player) {
                 return `Player ${player_name} not found.`;
            }
            // Fallback for 'with' or if player not found for 'at' before baritone.
            let result = "";
            const actionFn = async () => {
                result = await agent.vision_interpreter.lookAtPlayer(player_name, direction);
            };
            await agent.actions.runAction('action:lookAtPlayer', actionFn);
            return result;
        }
    },
    {
        name: '!lookAtPosition',
        description: 'Look at specified coordinates.',
        params: {
            'x': { type: 'int', description: 'x coordinate' },
            'y': { type: 'int', description: 'y coordinate' },
            'z': { type: 'int', description: 'z coordinate' }
        },
        perform: runAsAction(async (agent, x, y, z) => { // Wrapped with runAsAction for consistency
            skills.log(agent.bot, `Action: lookAtPosition ${x}, ${y}, ${z} using Baritone.`);
            await baritoneClient.lookAt(x, y, z);
            skills.log(agent.bot, `Baritone lookAt(${x}, ${y}, ${z}) command issued.`);
            // No explicit result needed, ActionManager handles success/failure.
        })
    },
    {
        name: '!digDown',
        description: 'Digs down a specified distance. Will stop if it reaches lava, water, or a fall of >=4 blocks below the bot.',
        params: {'distance': { type: 'int', description: 'Distance to dig down', domain: [1, Number.MAX_SAFE_INTEGER] }},
        perform: runAsAction(async (agent, distance) => {
            await skills.digDown(agent.bot, distance)
        })
    },
];
