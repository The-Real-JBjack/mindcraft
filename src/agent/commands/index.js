import { getBlockId, getItemId } from "../../utils/mcdata.js";
import { actionsList } from './actions.js';
import { queryList, executeQuery as performQueryExecute } from './queries.js'; // Renamed to avoid conflict if any

let suppressNoDomainWarning = false;

// Combine actions and queries into a single list and map for convenience
export const commandList = queryList.concat(actionsList); // Export if needed elsewhere, otherwise const
const commandMap = {};
for (let command of commandList) {
    commandMap[command.name] = command;
}

export function getCommand(name) {
    return commandMap[name];
}

export function blacklistCommands(commands) {
    // Adjusted to handle both '!' and '?' prefixes if necessary, though unblockable is usually for actions
    const unblockable = ['!stop', '!stats', '!inventory', '!goal', '?getInventorySummary'];
    for (let command_name of commands) {
        if (unblockable.includes(command_name)){
            console.warn(`Command ${command_name} is unblockable`);
            continue;
        }
        delete commandMap[command_name];
        delete commandList.find(command => command.name === command_name);
    }
}

// Updated regex to match both ! and ? prefixes
const commandRegex = /([!?])(\w+)(?:\(((?:-?\d+(?:\.\d+)?|true|false|"[^"]*")(?:\s*,\s*(?:-?\d+(?:\.\d+)?|true|false|"[^"]*"))*)\))?/;
const argRegex = /-?\d+(?:\.\d+)?|true|false|"[^"]*"/g;

export function containsCommand(message) {
    const commandMatch = message.match(commandRegex);
    if (commandMatch)
        return commandMatch[1] + commandMatch[2]; // Returns prefix + command name (e.g., "!stop", "?getInventorySummary")
    return null;
}

export function commandExists(commandNameWithPrefix) {
    // Assumes commandNameWithPrefix already includes '!' or '?'
    return commandMap[commandNameWithPrefix] !== undefined;
}

/**
 * Converts a string into a boolean.
 * @param {string} input
 * @returns {boolean | null} the boolean or `null` if it could not be parsed.
 * */
function parseBoolean(input) {
    switch(input.toLowerCase()) {
        case 'false': //These are interpreted as flase;
        case 'f':
        case '0':
        case 'off':
            return false;
        case 'true': //These are interpreted as true;
        case 't':
        case '1':
        case 'on':
            return true;
        default:
            return null;
    }
}

/**
 * @param {number} value - the value to check
 * @param {number} lowerBound
 * @param {number} upperBound
 * @param {string} endpointType - The type of the endpoints represented as a two character string. `'[)'` `'()'` 
 */
function checkInInterval(number, lowerBound, upperBound, endpointType) {
    switch (endpointType) {
        case '[)':
            return lowerBound <= number && number < upperBound;
        case '()':
            return lowerBound < number && number < upperBound;
        case '(]':
            return lowerBound < number && number <= upperBound;
        case '[]':
            return lowerBound <= number && number <= upperBound;
        default:
            throw new Error('Unknown endpoint type:', endpointType)
    }
}



// todo: handle arrays?
/**
 * Returns an object containing the command, the command name, and the comand parameters.
 * If parsing unsuccessful, returns an error message as a string.
 * @param {string} message - A message from a player or language model containing a command.
 * @returns {string | Object}
 */
export function parseCommandMessage(message) {
    const commandMatch = message.match(commandRegex);
    if (!commandMatch) return `Command is incorrectly formatted. Must start with ! or ?.`;

    const commandPrefix = commandMatch[1];
    const commandName = commandMatch[2];
    const commandNameWithPrefix = commandPrefix + commandName;

    let args;
    if (commandMatch[3]) args = commandMatch[3].match(argRegex); // Group 3 for args
    else args = [];

    const command = getCommand(commandNameWithPrefix);
    if(!command) return `${commandNameWithPrefix} is not a command.`

    const params = commandParams(command);
    const paramNames = commandParamNames(command);
    
    if (args.length !== params.length)
        return `Command ${command.name} was given ${args.length} args, but requires ${params.length} args.`;

    
    for (let i = 0; i < args.length; i++) {
        const param = params[i];
        //Remove any extra characters
        let arg = args[i].trim();
        if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
            arg = arg.substring(1, arg.length-1);
        }
        
        //Convert to the correct type
        switch(param.type) {
            case 'int':
                arg = Number.parseInt(arg); break;
            case 'float':
                arg = Number.parseFloat(arg); break;
            case 'boolean':
                arg = parseBoolean(arg); break;
            case 'BlockName':
            case 'ItemName':
                if (arg.endsWith('plank') && param.type === 'BlockName') // Ensure this heuristic is only for blocks
                    arg += 's'; // catches common mistakes like "oak_plank" instead of "oak_planks"
            case 'string':
                break;
            default:
                throw new Error(`Command '${commandNameWithPrefix}' parameter '${paramNames[i]}' has an unknown type: ${param.type}`);
        }
        if(arg === null || Number.isNaN(arg))
            return `Error: Param '${paramNames[i]}' must be of type ${param.type}.`

        if(typeof arg === 'number') { //Check the domain of numbers
            const domain = param.domain;
            if(domain) {
                /**
                 * Javascript has a built in object for sets but not intervals.
                 * Currently the interval (lowerbound,upperbound] is represented as an Array: `[lowerbound, upperbound, '(]']`
                 */
                if (!domain[2]) domain[2] = '[)'; //By default, lower bound is included. Upper is not.

                if(!checkInInterval(arg, ...domain)) {
                    return `Error: Param '${paramNames[i]}' must be an element of ${domain[2][0]}${domain[0]}, ${domain[1]}${domain[2][1]}.`;
                    //Alternatively arg could be set to the nearest value in the domain.
                }
            } else if (!suppressNoDomainWarning) {
                // console.warn(`Command '${commandNameWithPrefix}' parameter '${paramNames[i]}' has no domain set. Expect any value [-Infinity, Infinity].`);
                // Suppressing this warning as it can be noisy and many params don't need explicit domains.
                // suppressNoDomainWarning = true;
            }
        } else if(param.type === 'BlockName') { //Check that there is a block with this name
            if(getBlockId(arg) == null && arg !== 'air') return  `Invalid block type: ${arg}.`
        } else if(param.type === 'ItemName') { //Check that there is an item with this name
            if(getItemId(arg) == null) return `Invalid item type: ${arg}.`
        }
        args[i] = arg;
    }
    
    return { commandName: commandNameWithPrefix, args };
}

export function truncCommandMessage(message) {
    const commandMatch = message.match(commandRegex); // Uses updated regex
    if (commandMatch) {
        return message.substring(0, commandMatch.index + commandMatch[0].length);
    }
    return message;
}

export function isAction(commandNameWithPrefix) {
    // An action must start with '!' and be in the actionsList.
    return commandNameWithPrefix.startsWith('!') && actionsList.find(action => action.name === commandNameWithPrefix) !== undefined;
}

export function isQuery(commandNameWithPrefix) {
    // A query must start with '?' and be in the queryList.
    return commandNameWithPrefix.startsWith('?') && queryList.find(query => query.name === commandNameWithPrefix) !== undefined;
}

/**
 * @param {Object} command
 * @returns {Object[]} The command's parameters.
 */
function commandParams(command) {
    if (!command.params)
        return [];
    return Object.values(command.params);
}

/**
 * @param {Object} command
 * @returns {string[]} The names of the command's parameters.
 */
function commandParamNames(command) {
    if (!command.params)
        return [];
    return Object.keys(command.params);
}

function numParams(command) {
    return commandParams(command).length;
}

export async function executeCommand(agent, message) {
    let parsed = parseCommandMessage(message); // Uses updated parseCommandMessage
    if (typeof parsed === 'string') {
        return parsed; // Error message from parsing
    }

    console.log('parsed command:', parsed);
    const command = getCommand(parsed.commandName); // commandName now includes prefix

    // Argument count check (already handled well by parseCommandMessage if params are defined)
    // but double-checking here or relying on perform function signature is fine.
    // The original check was:
    // let numArgs = parsed.args ? parsed.args.length : 0;
    // if (numArgs !== numParams(command))
    //     return `Command ${command.name} was given ${numArgs} args, but requires ${numParams(command)} args.`;

    if (isQuery(parsed.commandName)) {
        // Use performQueryExecute for queries
        return await performQueryExecute(agent, parsed.commandName, parsed.args);
    } else if (isAction(parsed.commandName)) {
        // Use command.perform for actions
        return await command.perform(agent, ...parsed.args);
    } else {
        // Should not happen if commandExists and getCommand work correctly with commandList
        return `Command ${parsed.commandName} is neither a known action nor a query.`;
    }
}

export function getCommandDocs(agent) {
    const typeTranslations = {
        //This was added to keep the prompt the same as before type checks were implemented.
        //If the language model is giving invalid inputs changing this might help.
        'float':        'number',
        'int':          'number',
        'BlockName':    'string',
        'ItemName':     'string',
        'boolean':      'bool'
    }
    let docs = `\n*COMMAND DOCS\n You can use the following commands to perform actions and get information about the world. 
    Use the commands with the syntax: !commandName or !commandName("arg1", 1.2, ...) if the command takes arguments.\n
    Do not use codeblocks. Use double quotes for strings. Only use one command in each response, trailing commands and comments will be ignored.\n`;
    for (let command of commandList) {
        if (agent.blocked_actions.includes(command.name)) {
            continue;
        }
        docs += command.name + ': ' + command.description + '\n';
        if (command.params) {
            docs += 'Params:\n';
            for (let param in command.params) {
                docs += `${param}: (${typeTranslations[command.params[param].type]??command.params[param].type}) ${command.params[param].description}\n`;
            }
        }
    }
    return docs + '*\n';
}
