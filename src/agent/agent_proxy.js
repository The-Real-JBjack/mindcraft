import { io } from 'socket.io-client';
import convoManager from './conversation.js'; // Keep this if it's used by serverProxy logic directly
import settings from '../../settings.js';

class AgentServerProxy {
    constructor() {
        if (AgentServerProxy.instance) {
            return AgentServerProxy.instance;
        }
        
        this.socket = null;
        this.connected = false;
        this.agentName = null; // Store agent's name

        // Callbacks to be set by the agent instance
        this.handleRestartAgent = () => { console.warn('handleRestartAgent not implemented by agent'); };
        this.handleReceiveMessage = (username, message) => { console.warn('handleReceiveMessage not implemented by agent', username, message); };
        // Add other callbacks as needed for other events that interact with the agent

        AgentServerProxy.instance = this;
    }

    connect(agentInstance) { // Renamed parameter to avoid confusion with this.agent if it were kept
        if (this.connected) return;
        
        if (!agentInstance) {
            console.error("AgentServerProxy: connect() called without an agent instance.");
            return;
        }
        this.agentName = agentInstance.name;

        // Register callbacks from the provided agent instance
        if (typeof agentInstance.cleanKill === 'function') {
            this.handleRestartAgent = () => agentInstance.cleanKill();
        } else {
            console.error(`AgentServerProxy: agentInstance for ${this.agentName} does not have cleanKill method.`);
        }

        if (typeof agentInstance.respondFunc === 'function') {
            // We need to ensure respondFunc is called with the agent's context if it uses 'this'
            this.handleReceiveMessage = (username, message) => agentInstance.respondFunc(username, message, 'server_sent_message'); // Pass a type
        } else {
            console.error(`AgentServerProxy: agentInstance for ${this.agentName} does not have respondFunc method.`);
        }

        this.socket = io(`http://${settings.mindserver_host}:${settings.mindserver_port}`);
        this.connected = true;

        this.socket.on('connect', () => {
            console.log(`Agent ${this.agentName}: Connected to MindServer`);
            // Automatically login once connected if agentName is set
            if (this.agentName) {
                this.login();
            }
        });

        this.socket.on('disconnect', () => {
            console.log(`Agent ${this.agentName}: Disconnected from MindServer`);
            this.connected = false;
        });

        // convoManager is global/singleton, so it can be used directly here
        this.socket.on('chat-message', (receivedAgentName, json) => {
            convoManager.receiveFromBot(receivedAgentName, json);
        });

        this.socket.on('agents-update', (agents) => {
            convoManager.updateAgents(agents);
        });

        this.socket.on('restart-agent', (agentName_received) => {
            if (agentName_received === this.agentName) {
                console.log(`Agent ${this.agentName}: Received restart command.`);
                this.handleRestartAgent();
            }
        });

        this.socket.on('send-message', (agentName_ignored, message) => { // agentName_ignored as per original file
            console.log(`Agent ${this.agentName}: Received send-message command with message: ${message.substring(0, 50)}...`);
            // Assuming send-message is always for this agent instance currently connected through this socket
            try {
                // Call the registered callback
                this.handleReceiveMessage("MindServer", message); // Source is MindServer
            } catch (error) {
                console.error(`Agent ${this.agentName}: Error in handleReceiveMessage: `, JSON.stringify(error, Object.getOwnPropertyNames(error)));
            }
        });
    }

    login() {
        if (!this.socket || !this.connected) {
            console.warn(`Agent ${this.agentName}: Cannot login, socket not connected.`);
            return;
        }
        if (!this.agentName) {
            console.warn(`AgentServerProxy: agentName not set, cannot login.`);
            return;
        }
        console.log(`Agent ${this.agentName}: Emitting login-agent.`);
        this.socket.emit('login-agent', this.agentName);
    }

    shutdown() {
        if (!this.socket) return;
        console.log(`Agent ${this.agentName}: Emitting shutdown.`);
        this.socket.emit('shutdown');
    }

    getSocket() {
        return this.socket;
    }
}

// Create and export a singleton instance
export const serverProxy = new AgentServerProxy();

// This function remains unchanged as it uses the singleton's socket
export function sendBotChatToServer(agentName, json) {
    const socket = serverProxy.getSocket();
    if (socket && socket.connected) {
        socket.emit('chat-message', agentName, json);
    } else {
        console.warn(`AgentServerProxy: Cannot sendBotChatToServer for ${agentName}, socket not available or not connected.`);
    }
}
