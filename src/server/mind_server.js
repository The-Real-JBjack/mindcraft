import { Server } from 'socket.io';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

// Module-level variables
let io;
let server;
const registeredAgents = new Set();
const inGameAgents = {};
const agentManagers = {}; // socket for main process that registers/controls agents
const activeMessageClaims = new Map(); // messageId -> { botName, timestamp, originalUser, originalMessage }
const CLAIM_TIMEOUT = 30 * 1000; // 30 seconds for a claim to be considered valid then cleared

// Initialize the server
export function createMindServer(port = 8080) {
    const app = express();
    server = http.createServer(app);
    io = new Server(server);

    // Serve static files
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, 'public')));

    // Socket.io connection handling
    io.on('connection', (socket) => {
        let curAgentName = null;
        console.log('Client connected');

        agentsUpdate(socket);

        socket.on('register-agents', (agentNames) => {
            console.log(`Registering agents: ${agentNames}`);
            agentNames.forEach(name => registeredAgents.add(name));
            for (let name of agentNames) {
                agentManagers[name] = socket;
            }
            socket.emit('register-agents-success');
            agentsUpdate();
        });

        socket.on('login-agent', (agentName) => {
            if (curAgentName && curAgentName !== agentName) {
                console.warn(`Agent ${agentName} already logged in as ${curAgentName}`);
                return;
            }
            if (registeredAgents.has(agentName)) {
                curAgentName = agentName;
                inGameAgents[agentName] = socket;
                agentsUpdate();
            } else {
                console.warn(`Agent ${agentName} not registered`);
            }
        });

        socket.on('logout-agent', (agentName) => {
            if (inGameAgents[agentName]) {
                delete inGameAgents[agentName];
                agentsUpdate();
            }
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected');
            if (inGameAgents[curAgentName]) {
                delete inGameAgents[curAgentName];
                agentsUpdate();
            }
        });

        socket.on('chat-message', (agentName, json) => {
            if (!inGameAgents[agentName]) {
                console.warn(`Agent ${agentName} tried to send a message but is not logged in`);
                return;
            }
            console.log(`${curAgentName} sending message to ${agentName}: ${json.message}`);
            inGameAgents[agentName].emit('chat-message', curAgentName, json);
        });

        socket.on('restart-agent', (agentName) => {
            console.log(`Restarting agent: ${agentName}`);
            inGameAgents[agentName].emit('restart-agent');
        });

        socket.on('stop-agent', (agentName) => {
            let manager = agentManagers[agentName];
            if (manager) {
                manager.emit('stop-agent', agentName);
            }
            else {
                console.warn(`Stopping unregisterd agent ${agentName}`);
            }
        });

        socket.on('start-agent', (agentName) => {
            let manager = agentManagers[agentName];
            if (manager) {
                manager.emit('start-agent', agentName);
            }
            else {
                console.warn(`Starting unregisterd agent ${agentName}`);
            }
        });

        socket.on('stop-all-agents', () => {
            console.log('Killing all agents');
            stopAllAgents();
        });

        socket.on('shutdown', () => {
            console.log('Shutting down');
            for (let manager of Object.values(agentManagers)) {
                manager.emit('shutdown');
            }
            setTimeout(() => {
                process.exit(0);
            }, 2000);
        });

		socket.on('send-message', (agentName, message) => {
			if (!inGameAgents[agentName]) {
				console.warn(`Agent ${agentName} not logged in, cannot send message via MindServer.`);
				return
			}
			try {
				console.log(`Sending message to agent ${agentName}: ${message}`);
				inGameAgents[agentName].emit('send-message', agentName, message)
			} catch (error) {
				console.error('Error: ', error);
			}
		});

        socket.on('claim_response', ({ messageId, botName, originalUser, originalMessage, isMention }) => {
            if (!messageId || !botName) {
                console.warn(`MindServer: Received invalid claim_response data from ${botName || 'unknown agent'}.`);
                return;
            }

            // Log reception for debugging
            // console.log(`MindServer: Received claim_response for messageId '${messageId}' from '${botName}'. isMention: ${isMention}`);

            if (activeMessageClaims.has(messageId)) {
                const existingClaim = activeMessageClaims.get(messageId);
                console.log(`MindServer: MessageId '${messageId}' already claimed by '${existingClaim.botName}'. New claim from '${botName}' ignored.`);
                // Optionally, inform the claiming bot that it was too late.
                // socket.emit('claim_rejected', { messageId, reason: 'Already claimed' });
                return;
            }

            // If 'isMention' is true, it could potentially override a non-mention claim if timings were absolutely identical.
            // However, with network latency, the first one to arrive usually wins.
            // For simplicity, first valid claim wins. Priority for mentions is primarily handled by agents sending their claims faster.

            console.log(`MindServer: MessageId '${messageId}' claimed by '${botName}'. Broadcasting 'response_claimed'.`);
            activeMessageClaims.set(messageId, {
                botName,
                timestamp: Date.now(),
                originalUser, // Store these to send back
                originalMessage
            });

            // Broadcast to all connected clients (all agents)
            io.emit('response_claimed', {
                messageId,
                respondingBotName: botName,
                originalUser, // Send back the original context
                originalMessage
            });

            // Set a timeout to clear the claim to prevent memory leaks for messages that might not get cleared by agent logic
            setTimeout(() => {
                if (activeMessageClaims.has(messageId) && activeMessageClaims.get(messageId).botName === botName) {
                    activeMessageClaims.delete(messageId);
                    // console.log(`MindServer: Cleared claim for messageId '${messageId}' after timeout.`);
                }
            }, CLAIM_TIMEOUT);
        });
    });

    server.listen(port, 'localhost', () => {
        console.log(`MindServer running on port ${port}`);
    });

    return server;
}

function agentsUpdate(socket) {
    if (!socket) {
        socket = io;
    }
    let agents = [];
    registeredAgents.forEach(name => {
        agents.push({name, in_game: !!inGameAgents[name]});
    });
    socket.emit('agents-update', agents);
}

function stopAllAgents() {
    for (const agentName in inGameAgents) {
        let manager = agentManagers[agentName];
        if (manager) {
            manager.emit('stop-agent', agentName);
        }
    }
}

// Optional: export these if you need access to them from other files
export const getIO = () => io;
export const getServer = () => server;
export const getConnectedAgents = () => connectedAgents; 
