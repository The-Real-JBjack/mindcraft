// baritone_client.js
// This module is responsible for communicating with the Baritone Java application's API.

// We'll use axios for making HTTP requests.
// In a real project, you would install this using: npm install axios
// For now, we'll assume it's available or a similar fetch-like API.
// If running in Node.js, you'd typically do: const axios = require('axios');
// For a more modern ESM approach (if package.json type is module): import axios from 'axios';

// Let's simulate axios with a global fetch if axios isn't directly available in this environment.
// This is a common pattern for environments where 'fetch' is standard.
const axios = {
    post: async (url, data) => {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                // If parsing error response as JSON fails, use the raw text
                const errorText = await response.text();
                throw new Error(`Baritone API error ${response.status}: ${errorText}`);
            }
            throw new Error(`Baritone API error ${response.status}: ${errorData.message || JSON.stringify(errorData)}`);
        }
        return response.json(); // Assuming JSON responses, Baritone should send { message: "...", ... }
    },
    get: async (url) => {
        const response = await fetch(url, {
            method: 'GET',
        });
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                // If parsing error response as JSON fails, use the raw text
                const errorText = await response.text();
                throw new Error(`Baritone API error ${response.status}: ${errorText}`);
            }
            throw new Error(`Baritone API error ${response.status}: ${errorData.message || JSON.stringify(errorData)}`);
        }
        return response.json(); // Assuming JSON responses
    }
};

const BARITONE_API_BASE_URL = 'http://localhost:4567/api/baritone'; // Matching the Java port

/**
 * Sends a command to Baritone to navigate to the specified coordinates.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {Promise<object>} Response from the Baritone API
 */
async function goTo(x, y, z) {
    try {
        const response = await axios.post(`${BARITONE_API_BASE_URL}/goto`, { x, y, z });
        console.log('goto API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling goto API:', error.message);
        throw error;
    }
}

/**
 * Sends a command to Baritone to stop its current pathfinding.
 * @returns {Promise<object>} Response from the Baritone API
 */
async function stop() {
    try {
        // Assuming /stop can be a POST or GET. Let's use POST for consistency.
        const response = await axios.post(`${BARITONE_API_BASE_URL}/stop`, {});
        console.log('stop API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling stop API:', error.message);
        throw error;
    }
}

/**
 * Sends a command to Baritone to mine a block at the specified coordinates.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {Promise<object>} Response from the Baritone API
 */
async function mineBlock(x, y, z) {
    try {
        const response = await axios.post(`${BARITONE_API_BASE_URL}/mineBlock`, { x, y, z });
        console.log('mineBlock API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling mineBlock API:', error.message);
        throw error;
    }
}

/**
 * Sends a command to Baritone to place a block at the specified coordinates.
 * @param {string} blockType The type of block to place (e.g., "minecraft:dirt")
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {Promise<object>} Response from the Baritone API
 */
async function placeBlock(blockType, x, y, z) {
    try {
        const response = await axios.post(`${BARITONE_API_BASE_URL}/placeBlock`, { blockType, x, y, z });
        console.log('placeBlock API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling placeBlock API:', error.message);
        throw error;
    }
}

/**
 * Sends a command to Baritone to follow a specific entity.
 * (Note: Entity identification might be complex and require more details)
 * @param {string} entityId Identifier for the entity to follow.
 * @returns {Promise<object>} Response from the Baritone API
 */
async function followEntity(entityId) {
    try {
        const response = await axios.post(`${BARITONE_API_BASE_URL}/follow`, { entityId });
        console.log('followEntity API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling followEntity API:', error.message);
        throw error;
    }
}

/**
 * Sends a command to Baritone to attack an entity.
 * @param {string} entityId Identifier for the entity to attack.
 * @returns {Promise<object>} Response from the Baritone API
 */
async function attackEntity(entityId) {
    try {
        const response = await axios.post(`${BARITONE_API_BASE_URL}/attack`, { entityId });
        console.log('attackEntity API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling attackEntity API:', error.message);
        throw error;
    }
}

/**
 * Sends a command to Baritone to interact with an entity or block.
 * @param {string} targetId Identifier for the entity or block.
 * @returns {Promise<object>} Response from the Baritone API
 */
async function interact(targetId) {
    try {
        const response = await axios.post(`${BARITONE_API_BASE_URL}/interact`, { targetId });
        console.log('interact API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling interact API:', error.message);
        throw error;
    }
}

/**
 * Sends a command to Baritone to look at specific coordinates.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {Promise<object>} Response from the Baritone API
 */
async function lookAt(x, y, z) {
    try {
        const response = await axios.post(`${BARITONE_API_BASE_URL}/lookAt`, { x, y, z });
        console.log('lookAt API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling lookAt API:', error.message);
        throw error;
    }
}

// Example usage (for testing this module independently):
/*
async function testClient() {
    try {
        // console.log("Testing goTo(10, 20, 30)...");
        // const gotoRes = await goTo(10, 20, 30);
        // console.log("goTo response:", gotoRes);

        // console.log("\nTesting stop()...");
        // const stopRes = await stop();
        // console.log("stop response:", stopRes);

        // Add more tests as needed
    } catch (e) {
        console.error("Test failed:", e);
    }
}

export {
    goTo,
    stop,
    mineBlock,
    placeBlock,
    followEntity,
    attackEntity,
    interact,
    lookAt,
    killHostileMobs,
    defend,
    interactWithBlock,
    interactWithEntity,
    getInventory,
    getSelectedItem,
    getNearbyBlocks,
    getNearbyEntities,
    getNearbyItems,
};

// To run testClient, you would typically execute this file with Node.js
// testClient();
*/

/**
 * Sends a command to Baritone to automatically attack nearby hostile mobs.
 * @returns {Promise<object>} Response from the Baritone API
 */
async function killHostileMobs() {
    try {
        const response = await axios.post(`${BARITONE_API_BASE_URL}/killHostileMobs`, {});
        console.log('killHostileMobs API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling killHostileMobs API:', error.message);
        throw error;
    }
}

/**
 * Fetches the bot's current inventory from the Baritone API.
 * @returns {Promise<object>} Response from the Baritone API (expected to contain inventory list)
 */
async function getInventory() {
    try {
        const response = await axios.get(`${BARITONE_API_BASE_URL}/inventory`);
        console.log('getInventory API response:', response);
        return response; // Assuming this is { status, message, data: [items] }
    } catch (error) {
        console.error('Error calling getInventory API:', error.message);
        throw error;
    }
}

/**
 * Fetches the bot's currently selected item from the Baritone API.
 * @returns {Promise<object>} Response from the Baritone API (expected to contain selected item)
 */
async function getSelectedItem() {
    try {
        const response = await axios.get(`${BARITONE_API_BASE_URL}/selectedItem`);
        console.log('getSelectedItem API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling getSelectedItem API:', error.message);
        throw error;
    }
}

/**
 * Fetches a list of nearby blocks from the Baritone API.
 * @param {number} radius The radius to search within.
 * @returns {Promise<object>} Response from the Baritone API (expected to contain list of blocks)
 */
async function getNearbyBlocks(radius) {
    try {
        const response = await axios.get(`${BARITONE_API_BASE_URL}/nearbyBlocks/${radius}`);
        console.log('getNearbyBlocks API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling getNearbyBlocks API:', error.message);
        throw error;
    }
}

/**
 * Fetches a list of nearby entities from the Baritone API.
 * @param {number} radius The radius to search within.
 * @returns {Promise<object>} Response from the Baritone API (expected to contain list of entities)
 */
async function getNearbyEntities(radius) {
    try {
        const response = await axios.get(`${BARITONE_API_BASE_URL}/nearbyEntities/${radius}`);
        console.log('getNearbyEntities API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling getNearbyEntities API:', error.message);
        throw error;
    }
}

/**
 * Fetches a list of nearby dropped items from the Baritone API.
 * @param {number} radius The radius to search within.
 * @returns {Promise<object>} Response from the Baritone API (expected to contain list of items)
 */
async function getNearbyItems(radius) {
    try {
        const response = await axios.get(`${BARITONE_API_BASE_URL}/nearbyItems/${radius}`);
        console.log('getNearbyItems API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling getNearbyItems API:', error.message);
        throw error;
    }
}

/**
 * Sends a command to Baritone to defend a specified entity.
 * @param {string} entityId Identifier for the entity to defend.
 * @returns {Promise<object>} Response from the Baritone API
 */
async function defend(entityId) {
    try {
        const response = await axios.post(`${BARITONE_API_BASE_URL}/defend`, { entityId });
        console.log('defend API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling defend API:', error.message);
        throw error;
    }
}

/**
 * Sends a command to Baritone to interact with a block at the specified coordinates.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {Promise<object>} Response from the Baritone API
 */
async function interactWithBlock(x, y, z) {
    try {
        const response = await axios.post(`${BARITONE_API_BASE_URL}/interactWithBlock`, { x, y, z });
        console.log('interactWithBlock API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling interactWithBlock API:', error.message);
        throw error;
    }
}

/**
 * Sends a command to Baritone to interact with a specific entity.
 * @param {string} entityId Identifier for the entity to interact with.
 * @returns {Promise<object>} Response from the Baritone API
 */
async function interactWithEntity(entityId) {
    try {
        const response = await axios.post(`${BARITONE_API_BASE_URL}/interactWithEntity`, { entityId });
        console.log('interactWithEntity API response:', response);
        return response;
    } catch (error) {
        console.error('Error calling interactWithEntity API:', error.message);
        throw error;
    }
}
