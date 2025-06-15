import { sendBaritoneCommand } from './baritone_bridge.js';

async function baritoneGoToCoordinates(agent, x, y, z) {
  const commandString = `goto ${x} ${y} ${z}`;
  console.log(`Attempting to send Baritone command: ${commandString}`);
  try {
    const result = await agent.sendBaritoneCommand(agent, commandString);
    console.log(`Baritone command "${commandString}" succeeded: ${result}`);
    return result;
  } catch (error) {
    console.error(`Baritone command "${commandString}" failed: ${error.message}`);
    throw error; // Re-throw to allow caller to handle
  }
}

async function baritoneGoToBlockType(agent, blockType) {
  const commandString = `goto ${blockType}`;
  console.log(`Attempting to send Baritone command: ${commandString}`);
  try {
    const result = await agent.sendBaritoneCommand(agent, commandString);
    console.log(`Baritone command "${commandString}" succeeded: ${result}`);
    return result;
  } catch (error) {
    console.error(`Baritone command "${commandString}" failed: ${error.message}`);
    throw error; // Re-throw to allow caller to handle
  }
}

async function baritoneStop(agent) {
  const commandString = 'stop';
  console.log(`Attempting to send Baritone command: ${commandString}`);
  try {
    const result = await agent.sendBaritoneCommand(agent, commandString);
    console.log(`Baritone command "${commandString}" succeeded: ${result}`);
    return result;
  } catch (error) {
    console.error(`Baritone command "${commandString}" failed: ${error.message}`);
    throw error; // Re-throw to allow caller to handle
  }
}

async function baritoneMineBlock(agent, blockType, count = null) {
  const commandString = count ? `mine ${count} ${blockType}` : `mine ${blockType}`;
  console.log(`Attempting to send Baritone command: ${commandString}`);
  try {
    const result = await agent.sendBaritoneCommand(agent, commandString);
    console.log(`Baritone command "${commandString}" succeeded: ${result}`);
    return result;
  } catch (error) {
    console.error(`Baritone command "${commandString}" failed: ${error.message}`);
    throw error; // Re-throw to allow caller to handle
  }
}

async function baritoneSetSetting(agent, setting, value) {
  const commandString = `${setting} ${value}`; // Note: Baritone settings don't typically use '#' prefix via commands
  console.log(`Attempting to send Baritone command: ${commandString}`);
  try {
    // We still use sendBaritoneCommand as it handles the promise and chat interface
    const result = await agent.sendBaritoneCommand(agent, commandString);
    console.log(`Baritone command "${commandString}" succeeded: ${result}`);
    return result;
  } catch (error) {
    console.error(`Baritone command "${commandString}" failed: ${error.message}`);
    throw error; // Re-throw to allow caller to handle
  }
}

/**
 * Sends the 'find' command to Baritone and parses the response.
 * @param {object} agent - The agent instance.
 * @param {string} blockType - The type of block to find.
 * @returns {Promise<object>} A promise that resolves to an object:
 *  - { found: true, blockType: string, position: {x, y, z} } if successful.
 *  - { found: false, error: string } if failed or response is unrecognized.
 */
async function baritoneFindBlock(agent, blockType) {
  const commandString = `find ${blockType}`;
  console.log(`Attempting to send Baritone command: ${commandString}`);
  try {
    const rawResponse = await agent.sendBaritoneCommand(agent, commandString);
    console.log(`Baritone command "${commandString}" raw response: ${rawResponse}`);

    // Regex for success: "Found <block_type> at <x>, <y>, <z>"
    // It might also include " (closest accessible)" or similar, so we make that part optional.
    const successPattern = /^Found (\w+) at (-?\d+\.?\d*), (-?\d+\.?\d*), (-?\d+\.?\d*)(?: \([^)]*\))?/i;
    const successMatch = rawResponse.match(successPattern);

    if (successMatch) {
      const [, matchedBlockType, x_str, y_str, z_str] = successMatch;
      return {
        found: true,
        blockType: matchedBlockType,
        position: {
          x: parseFloat(x_str),
          y: parseFloat(y_str),
          z: parseFloat(z_str),
        },
      };
    }

    // Regex for known failure patterns
    const failurePatternCouldNotFind = /^Could not find goal for/i; // Example: "Could not find goal for FindBlock(minecraft:diamond_ore)"
    const failurePatternError = /^Error:/i; // General Baritone error

    if (failurePatternCouldNotFind.test(rawResponse) || failurePatternError.test(rawResponse)) {
      return { found: false, error: rawResponse };
    }

    // If no specific pattern matched, but we got a response (not an error from sendBaritoneCommand itself)
    return { found: false, error: `Unrecognized response from Baritone #find: ${rawResponse}` };

  } catch (error) {
    // This catch block handles errors from agent.sendBaritoneCommand itself (e.g., timeout)
    console.error(`Baritone command "${commandString}" failed: ${error.message}`);
    return { found: false, error: error.message };
  }
}

/**
 * Sends the 'eta' command to Baritone and parses the response.
 * @param {object} agent - The agent instance.
 * @returns {Promise<object>} A promise that resolves to an object describing Baritone's ETA status:
 *  - { status: 'pathing', segmentETA: string, goalETA: string } if pathing with ETA.
 *  - { status: 'idle' } if no current path or goal.
 *  - { status: 'calculating' } if currently calculating a path.
 *  - { status: 'unknown', rawResponse: string } if the response is unrecognized.
 *  - { status: 'error', error: string } if the command failed.
 */
async function baritoneGetETA(agent) {
  const commandString = 'eta';
  console.log(`Attempting to send Baritone command: ${commandString}`);
  try {
    const rawResponse = await agent.sendBaritoneCommand(agent, commandString);
    console.log(`Baritone command "${commandString}" raw response: ${rawResponse}`);

    const pathingPattern = /ETA: (.*?) to current segment, (.*?) to goal/i;
    const noPathPattern = /No current path or goal/i;
    const calculatingPattern = /Currently calculating path\.\.\./i; // Note: Actual message might vary slightly

    let match;

    match = rawResponse.match(pathingPattern);
    if (match) {
      return { status: 'pathing', segmentETA: match[1], goalETA: match[2] };
    }

    if (noPathPattern.test(rawResponse)) {
      return { status: 'idle' };
    }

    if (calculatingPattern.test(rawResponse)) {
      return { status: 'calculating' };
    }

    // Check for common error messages from Baritone itself if it couldn't provide an ETA
    // These might overlap with generic errors but can provide more specific status if preferred.
    // For now, we'll let them fall into 'unknown' or be caught by the generic error catch.

    return { status: 'unknown', rawResponse: rawResponse };
  } catch (error) {
    console.error(`Baritone command "${commandString}" failed: ${error.message}`);
    return { status: 'error', error: error.message };
  }
}

async function baritoneGetProcInfo(agent) {
  const commandString = 'proc';
  console.log(`Attempting to send Baritone command: ${commandString}`);
  try {
    const result = await agent.sendBaritoneCommand(agent, commandString);
    console.log(`Baritone command "${commandString}" result: ${result}`);
    // TODO: Parse the raw #proc output into a structured object if its format is consistent.
    // For now, returning the raw string for the LLM to interpret or for debugging.
    // Example output might be: "Current Process: Idle (Priority: 0.0)" or "Current Process: Pathing (Goal: ...) (Priority: ...)"
    return result; // Raw string response
  } catch (error) {
    console.error(`Baritone command "${commandString}" failed: ${error.message}`);
    // Consider returning a structured error here too, e.g., { error: error.message }
    throw error; // Re-throw to allow caller to handle, or return structured error
  }
}

export {
  baritoneGoToCoordinates,
  baritoneGoToBlockType,
  baritoneStop,
  baritoneMineBlock,
  baritoneSetSetting,
  baritoneFindBlock,
  baritoneGetETA,
  baritoneGetProcInfo,
  baritoneSetGoal,
  baritoneSetGoalHere,
  baritoneInvertGoal,
  baritonePath,
  baritoneFollow
};

// Helper function to get entity type from mcdata for validation if needed
// const getMinecraftEntityByName = (name) => mcdata.entitiesByName[name];


/**
 * Commands Baritone to follow a player or a type of entity.
 * @param {object} agent - The agent instance.
 * @param {string} targetType - Type of target. Can be 'player', 'entity', or 'entities'.
 * @param {string | null} [targetName=null] - The name of the player or type of the entity (e.g., 'pig', 'zombie').
 *                                          Required if targetType is 'player' or 'entity'.
 * @returns {Promise<string>} The result from Baritone.
 * @example
 * await agent.baritoneFollow(agent, 'player', 'playerName'); // Follows a specific player
 * await agent.baritoneFollow(agent, 'entity', 'pig');      // Follows any pig
 * await agent.baritoneFollow(agent, 'entities');           // Follows any/all entities (Baritone's general follow)
 */
async function baritoneFollow(agent, targetType, targetName = null) {
  let commandString;
  if (targetType === 'player' && targetName) {
    commandString = `follow player ${targetName}`;
  } else if (targetType === 'entity' && targetName) {
    // Baritone's "follow entity <type>" targets any entity of that type.
    // It doesn't usually take a specific entity UUID or a custom name here.
    // targetName here should be an entity type like 'pig', 'minecraft:pig', etc.
    commandString = `follow entity ${targetName}`;
  } else if (targetType === 'entities') {
    commandString = `follow entities`; // General command to follow entities based on Baritone's settings
  } else {
    const errorMessage = `Invalid arguments for baritoneFollow: targetType='${targetType}', targetName='${targetName}'. ` +
                         `Usage: ('player', '<playerName>'), ('entity', '<entityType>'), or ('entities').`;
    console.error(errorMessage);
    return Promise.reject(new Error(errorMessage));
  }

  console.log(`Attempting to send Baritone command: ${commandString}`);
  try {
    const result = await agent.sendBaritoneCommand(agent, commandString);
    console.log(`Baritone command "${commandString}" succeeded: ${result}`);
    return result;
  } catch (error) {
    console.error(`Baritone command "${commandString}" failed: ${error.message}`);
    throw error;
  }
}

async function baritoneSetGoal(agent, x, y, z) {
  const commandString = `goal ${x} ${y} ${z}`;
  console.log(`Attempting to send Baritone command: ${commandString}`);
  try {
    const result = await agent.sendBaritoneCommand(agent, commandString);
    console.log(`Baritone command "${commandString}" succeeded: ${result}`);
    return result;
  } catch (error) {
    console.error(`Baritone command "${commandString}" failed: ${error.message}`);
    throw error;
  }
}

async function baritoneSetGoalHere(agent) {
  const commandString = 'goal';
  console.log(`Attempting to send Baritone command: ${commandString}`);
  try {
    const result = await agent.sendBaritoneCommand(agent, commandString);
    console.log(`Baritone command "${commandString}" succeeded: ${result}`);
    return result;
  } catch (error) {
    console.error(`Baritone command "${commandString}" failed: ${error.message}`);
    throw error;
  }
}

async function baritoneInvertGoal(agent) {
  const commandString = 'invert';
  console.log(`Attempting to send Baritone command: ${commandString}`);
  try {
    const result = await agent.sendBaritoneCommand(agent, commandString);
    console.log(`Baritone command "${commandString}" succeeded: ${result}`);
    return result;
  } catch (error) {
    console.error(`Baritone command "${commandString}" failed: ${error.message}`);
    throw error;
  }
}

async function baritonePath(agent) {
  const commandString = 'path';
  console.log(`Attempting to send Baritone command: ${commandString}`);
  try {
    // This command might take longer if Baritone needs to calculate a complex path.
    // The generic timeout in sendBaritoneCommand (30s) should ideally be sufficient.
    // If specific timeouts are needed per command, sendBaritoneCommand would need adjustment.
    const result = await agent.sendBaritoneCommand(agent, commandString);
    console.log(`Baritone command "${commandString}" succeeded: ${result}`);
    return result;
  } catch (error) {
    console.error(`Baritone command "${commandString}" failed: ${error.message}`);
    throw error;
  }
}
