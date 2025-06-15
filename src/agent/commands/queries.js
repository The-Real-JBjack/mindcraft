import * as world from '../library/world.js'; // Will be partially replaced
const baritoneClient = require('../../baritone_client.js'); // Added Baritone client
import * as mc from '../../utils/mcdata.js';
import { getCommandDocs } from './index.js';
import convoManager from '../conversation.js';
import { checkLevelBlueprint, checkBlueprint } from '../tasks/construction_tasks.js';
import { load } from 'cheerio';

const pad = (str) => {
    return '\n' + str + '\n';
}

// queries are commands that just return strings and don't affect anything in the world
export const queryList = [
    {
        name: "!stats",
        description: "Get your bot's location, health, hunger, and time of day.", 
        perform: function (agent) {
            let bot = agent.bot;
            let res = 'STATS';
            let pos = bot.entity.position;
            // display position to 2 decimal places
            res += `\n- Position: x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)}`;
            // Gameplay
            res += `\n- Gamemode: ${bot.game.gameMode}`;
            res += `\n- Health: ${Math.round(bot.health)} / 20`;
            res += `\n- Hunger: ${Math.round(bot.food)} / 20`;
            res += `\n- Biome: ${world.getBiomeName(bot)}`;
            let weather = "Clear";
            if (bot.rainState > 0)
                weather = "Rain";
            if (bot.thunderState > 0)
                weather = "Thunderstorm";
            res += `\n- Weather: ${weather}`;
            // let block = bot.blockAt(pos);
            // res += `\n- Artficial light: ${block.skyLight}`;
            // res += `\n- Sky light: ${block.light}`;
            // light properties are bugged, they are not accurate
            res += '\n- ' + world.getSurroundingBlocks(bot).join('\n- ')
            res += `\n- First Solid Block Above Head: ${world.getFirstBlockAboveHead(bot, null, 32)}`;


            if (bot.time.timeOfDay < 6000) {
                res += '\n- Time: Morning';
            } else if (bot.time.timeOfDay < 12000) {
                res += '\n- Time: Afternoon';
            } else {
                res += '\n- Time: Night';
            }

            // get the bot's current action
            let action = agent.actions.currentActionLabel;
            if (agent.isIdle())
                action = 'Idle';
            res += `\- Current Action: ${action}`;


            let players = world.getNearbyPlayerNames(bot);
            let bots = convoManager.getInGameAgents().filter(b => b !== agent.name);
            players = players.filter(p => !bots.includes(p));

            res += '\n- Nearby Human Players: ' + (players.length > 0 ? players.join(', ') : 'None.');
            res += '\n- Nearby Bot Players: ' + (bots.length > 0 ? bots.join(', ') : 'None.');

            res += '\n' + agent.bot.modes.getMiniDocs() + '\n';
            return pad(res);
        }
    },
    {
        name: "!inventory",
        description: "Get your bot's inventory.",
        perform: async function (agent) { // Made async
            let res = 'INVENTORY';
            try {
                const inventoryResponse = await baritoneClient.getInventory();
                if (inventoryResponse && inventoryResponse.data && inventoryResponse.data.length > 0) {
                    for (const item of inventoryResponse.data) {
                        res += `\n- ${item.name}: ${item.quantity}`;
                    }
                } else {
                    res += ': Nothing';
                }

                if (agent.bot.game.gameMode === 'creative') { // This part can remain as it's bot specific game mode
                    res += '\n(You have infinite items in creative mode. You do not need to gather resources!!)';
                }

                // Get selected item
                const selectedItemResponse = await baritoneClient.getSelectedItem();
                if (selectedItemResponse && selectedItemResponse.data && selectedItemResponse.data.name) {
                    res += `\nSELECTED_ITEM: ${selectedItemResponse.data.name} (qty: ${selectedItemResponse.data.quantity})`;
                } else {
                    res += `\nSELECTED_ITEM: Nothing selected or unable to determine.`;
                }

                // Wearing armor - this still needs mineflayer or equivalent direct mc data access
                // For now, let's comment it out or acknowledge it might be stale if Baritone is fully independent
                let bot = agent.bot;
                let helmet = bot.inventory.slots[5];
                let chestplate = bot.inventory.slots[6];
                let leggings = bot.inventory.slots[7];
                let boots = bot.inventory.slots[8];
                res += '\nWEARING (Note: This info might be from a separate source than Baritone): ';
                if (helmet) res += `\nHead: ${helmet.name}`;
                if (chestplate) res += `\nTorso: ${chestplate.name}`;
                if (leggings) res += `\nLegs: ${leggings.name}`;
                if (boots) res += `\nFeet: ${boots.name}`;
                if (!helmet && !chestplate && !leggings && !boots) res += 'Nothing';

            } catch (e) {
                console.error("Error fetching inventory from Baritone:", e);
                res += `\nError fetching inventory: ${e.message}`;
            }
            return pad(res);
        }
    },
    {
        name: "!nearbyBlocks",
        description: "Get the blocks near the bot within a specified radius (default 10).",
        params: {
            'radius': { type: 'int', description: 'The radius to search within.', optional: true, default: 10, domain: [1, 32] }
        },
        perform: async function (agent, radius = 10) { // Made async
            let res = 'NEARBY_BLOCKS';
            try {
                const blocksResponse = await baritoneClient.getNearbyBlocks(radius);
                if (blocksResponse && blocksResponse.data && blocksResponse.data.length > 0) {
                    for (const block of blocksResponse.data) {
                        res += `\n- ${block.type} at x:${block.x.toFixed(1)}, y:${block.y.toFixed(1)}, z:${block.z.toFixed(1)}`;
                    }
                } else {
                    res += ': none found within radius ' + radius;
                }
                // The old "Environmental Awareness" might be redundant if Baritone provides comprehensive data
                // For now, we comment it out. It could be re-added if needed.
                // res += '\n- ' + world.getSurroundingBlocks(agent.bot).join('\n- ')
                // res += `\n- First Solid Block Above Head: ${world.getFirstBlockAboveHead(agent.bot, null, 32)}`;
            } catch (e) {
                console.error("Error fetching nearby blocks from Baritone:", e);
                res += `\nError fetching nearby blocks: ${e.message}`;
            }
            return pad(res);
        }
    },
    {
        name: "!craftable",
        description: "Get the craftable items with the bot's inventory.",
        perform: function (agent) {
            let craftable = world.getCraftableItems(agent.bot);
            let res = 'CRAFTABLE_ITEMS';
            for (const item of craftable) {
                res += `\n- ${item}`;
            }
            if (res == 'CRAFTABLE_ITEMS') {
                res += ': none';
            }
            return pad(res);
        }
    },
    {
        name: "!entities",
        description: "Get nearby entities within a specified radius (default 10).",
        params: {
            'radius': { type: 'int', description: 'The radius to search within.', optional: true, default: 10, domain: [1, 32] }
        },
        perform: async function (agent, radius = 10) { // Made async
            let res = 'NEARBY_ENTITIES';
            try {
                const entitiesResponse = await baritoneClient.getNearbyEntities(radius);
                if (entitiesResponse && entitiesResponse.data && entitiesResponse.data.length > 0) {
                    for (const entity of entitiesResponse.data) {
                        res += `\n- ${entity.type} (ID: ${entity.id}) at x:${entity.x.toFixed(1)}, y:${entity.y.toFixed(1)}, z:${entity.z.toFixed(1)}`;
                    }
                } else {
                    res += ': none found within radius ' + radius;
                }
            } catch (e) {
                console.error("Error fetching nearby entities from Baritone:", e);
                res += `\nError fetching nearby entities: ${e.message}`;
            }
            return pad(res);
        }
    },
    {
        name: "!nearbyItems",
        description: "Get nearby dropped items within a specified radius (default 10).",
        params: {
            'radius': { type: 'int', description: 'The radius to search within.', optional: true, default: 10, domain: [1, 32] }
        },
        perform: async function (agent, radius = 10) { // Made async
            let res = 'NEARBY_DROPPED_ITEMS';
            try {
                const itemsResponse = await baritoneClient.getNearbyItems(radius);
                if (itemsResponse && itemsResponse.data && itemsResponse.data.length > 0) {
                    for (const item of itemsResponse.data) {
                        res += `\n- ${item.itemType} (qty: ${item.quantity}) at x:${item.x.toFixed(1)}, y:${item.y.toFixed(1)}, z:${item.z.toFixed(1)}`;
                    }
                } else {
                    res += ': none found within radius ' + radius;
                }
            } catch (e) {
                console.error("Error fetching nearby items from Baritone:", e);
                res += `\nError fetching nearby items: ${e.message}`;
            }
            return pad(res);
        }
    },
    {
        name: "!modes",
        description: "Get all available modes and their docs and see which are on/off.",
        perform: function (agent) {
            return agent.bot.modes.getDocs();
        }
    },
    {
        name: '!savedPlaces',
        description: 'List all saved locations.',
        perform: async function (agent) {
            return "Saved place names: " + agent.memory_bank.getKeys();
        }
    }, 
    {
        name: '!checkBlueprintLevel',
        description: 'Check if the level is complete and what blocks still need to be placed for the blueprint',
        params: {
            'levelNum': { type: 'int', description: 'The level number to check.', domain: [0, Number.MAX_SAFE_INTEGER] }
        },
        perform: function (agent, levelNum) {
            let res = checkLevelBlueprint(agent, levelNum);
            console.log(res);
            return pad(res);
        }
    }, 
    {
        name: '!checkBlueprint',
        description: 'Check what blocks still need to be placed for the blueprint',
        perform: function (agent) {
            let res = checkBlueprint(agent);
            return pad(res);
        }
    }, 
    {
        name: '!getBlueprint',
        description: 'Get the blueprint for the building',
        perform: function (agent) {
            let res = agent.task.blueprint.explain();
            return pad(res);
        }
    }, 
    {
        name: '!getBlueprintLevel',
        description: 'Get the blueprint for the building',
        params: {
            'levelNum': { type: 'int', description: 'The level number to check.', domain: [0, Number.MAX_SAFE_INTEGER] }
        },
        perform: function (agent, levelNum) {
            let res = agent.task.blueprint.explainLevel(levelNum);
            console.log(res);
            return pad(res);
        }
    },
    {
        name: '!getCraftingPlan',
        description: "Provides a comprehensive crafting plan for a specified item. This includes a breakdown of required ingredients, the exact quantities needed, and an analysis of missing ingredients or extra items needed based on the bot's current inventory.",
        params: {
            targetItem: { 
                type: 'string', 
                description: 'The item that we are trying to craft' 
            },
            quantity: { 
                type: 'int',
                description: 'The quantity of the item that we are trying to craft',
                optional: true,
                domain: [1, Infinity, '[)'], // Quantity must be at least 1,
                default: 1
            }
        },
        perform: function (agent, targetItem, quantity = 1) {
            let bot = agent.bot;

            // Fetch the bot's inventory
            const curr_inventory = world.getInventoryCounts(bot); 
            const target_item = targetItem;
            let existingCount = curr_inventory[target_item] || 0;
            let prefixMessage = '';
            if (existingCount > 0) {
                curr_inventory[target_item] -= existingCount;
                prefixMessage = `You already have ${existingCount} ${target_item} in your inventory. If you need to craft more,\n`;
            }

            // Generate crafting plan
            try {
                let craftingPlan = mc.getDetailedCraftingPlan(target_item, quantity, curr_inventory);
                craftingPlan = prefixMessage + craftingPlan;
                return pad(craftingPlan);
            } catch (error) {
                console.error("Error generating crafting plan:", error);
                return `An error occurred while generating the crafting plan: ${error.message}`;
            }
            
            
        },
    },
    {
        name: '!searchWiki',
        description: 'Search the Minecraft Wiki for the given query.',
        params: {
            'query': { type: 'string', description: 'The query to search for.' }
        },
        perform: async function (agent, query) {
            const url = `https://minecraft.wiki/w/${query}`
            try {
                const response = await fetch(url);
                if (response.status === 404) {
                  return `${query} was not found on the Minecraft Wiki. Try adjusting your search term.`;
                }
                const html = await response.text();
                const $ = load(html);
            
                const parserOutput = $("div.mw-parser-output");
                
                parserOutput.find("table.navbox").remove();

                const divContent = parserOutput.text();
            
                return divContent.trim();
              } catch (error) {
                console.error("Error fetching or parsing HTML:", error);
                return `The following error occurred: ${error}`
              }
        }
    },
    {
        name: '!help',
        description: 'Lists all available commands and their descriptions.',
        perform: async function (agent) {
            return getCommandDocs(agent);
        }
    },
];
