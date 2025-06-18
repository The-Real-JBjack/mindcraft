import convoManager from './conversation.js'; // To get the list of active agents

let currentAssigneeIndex = 0;

class ResponseCoordinator {
    constructor() {
        this.agent = null; // Will be set by the agent using this coordinator
        // No longer need claim-related properties: activeClaims, processingMessageIds, respondedMessageIds
    }

    init(agent) {
        this.agent = agent;
        // No longer need to listen for 'response_claimed' from serverProxy for this new logic
        // Ensure serverProxy.socket listeners from previous versions are cleared if any were set by old coordinator logic,
        // although replacing the file content handles this.
        if (this.agent.serverProxy && this.agent.serverProxy.socket) {
             this.agent.serverProxy.socket.off('response_claimed'); // Explicitly remove old listener if it might exist
        }
        console.log(`${this.agent.name}: ResponseCoordinator initialized for initial assignment logic.`);
    }

    /**
     * Determines which agent is initially responsible for a message and
     * triggers the responsibility handler for that agent.
     * @param {string} username - The user who sent the message.
     * @param {string} message - The translated message content.
     * @param {object} originalMessageDetails - Contains { originalUser, originalMessageContent, messageId } if needed later.
     */
    assignInitialResponsibility(username, message, originalMessageDetails = {}) {
        if (!this.agent) {
            console.error("ResponseCoordinator not initialized with an agent.");
            return;
        }

        const activeAgents = convoManager.getInGameAgents();
        if (!activeAgents || activeAgents.length === 0) {
            console.warn(`${this.agent.name}: No active agents found to assign responsibility. Handling message directly.`);
            // Fallback: if no other agents, this agent handles it.
            // This will call the new ResponsibilityHandler, which needs to be created in the next step.
            if (this.agent.responsibilityHandler) {
                this.agent.responsibilityHandler.decideAndAct({
                    messageId: originalMessageDetails.messageId || Date.now().toString(), // Simple messageId
                    username: username,
                    message: message,
                    fullHistory: this.agent.history.getHistory(), // Pass current history
                    isForced: false, // Not forced initially
                    initialReceiverName: this.agent.name // It's the initial receiver
                });
            } else {
                 console.error(`${this.agent.name}: ResponsibilityHandler not found on agent.`);
                 // Fallback to old direct handling if responsibility handler isn't there yet
                 // This line should eventually be removed once ResponsibilityHandler is integrated:
                 this.agent.handleMessage(username, message);
            }
            return;
        }

        // Sort agent names to ensure consistent order for round-robin
        const sortedAgentNames = [...activeAgents].sort();

        if (currentAssigneeIndex >= sortedAgentNames.length) {
            currentAssigneeIndex = 0; // Reset index
        }

        const assignedBotName = sortedAgentNames[currentAssigneeIndex];
        currentAssigneeIndex = (currentAssigneeIndex + 1) % sortedAgentNames.length; // Increment for next time

        console.log(`${this.agent.name}: User message from '${username}'. Initial responsibility assigned to: '${assignedBotName}'. My name: ${this.agent.name}`);

        if (this.agent.name === assignedBotName) {
            console.log(`${this.agent.name}: I am the initial receiver for message from '${username}'. Triggering ResponsibilityHandler.`);
            // This agent is chosen. It will proceed to use its ResponsibilityHandler.
            // The ResponsibilityHandler module will be created in the next step.
            // For now, we can log or call a placeholder.
            if (this.agent.responsibilityHandler) {
                 this.agent.responsibilityHandler.decideAndAct({
                    messageId: originalMessageDetails.messageId || Date.now().toString(),
                    username: username,
                    message: message,
                    fullHistory: this.agent.history.getHistory(),
                    isForced: false,
                    initialReceiverName: this.agent.name
                });
            } else {
                console.error(`${this.agent.name}: ResponsibilityHandler not found on agent. Message for ${assignedBotName} will be handled by its own instance.`);
                // If this agent is the assigned one, but the handler isn't wired yet,
                // it would eventually call handleMessage. For now, this log suffices because
                // the actual call will happen on the *instance* of the assigned bot.
            }
        } else {
            // This agent is not chosen. It will do nothing further unless responsibility is passed to it.
            console.log(`${this.agent.name}: I am not the initial receiver. '${assignedBotName}' will handle initially.`);
        }
    }

    // Remove old methods related to claim-based coordination:
    // attemptClaim, handleResponseClaimed, generateMessageId (if only for claims), markAsResponded (if only for claims)
}

// Export a single instance. Each agent will have its own instance of this.
// No, this should not be a singleton if each agent news `this.agent`.
// The previous implementation was `export default responseCoordinator = new ResponseCoordinator()`
// which made it a singleton. This needs to change if `this.agent` is to be specific.
// Let's make it a class that agent.js instantiates.

export default ResponseCoordinator; // Changed from singleton export
