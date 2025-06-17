import crypto from 'crypto';
import { serverProxy } from './agent_proxy.js'; // Assuming agent_proxy will be used for socket communication

// Store message IDs that are currently being processed for a response claim
const processingMessageIds = new Set();
// Store message IDs that have already been responded to, to prevent re-processing
const respondedMessageIds = new Set();
// Timeout for clearing message IDs from sets (e.g., 5 minutes)
const MESSAGE_ID_TIMEOUT = 5 * 60 * 1000;

function generateMessageId(username, message) {
    const hash = crypto.createHash('sha256');
    hash.update(username + message + Date.now()); // Add timestamp for more uniqueness if needed
    return hash.digest('hex');
}

class ResponseCoordinator {
    constructor() {
        this.agent = null; // Will be set by the agent using this coordinator
        this.activeClaims = new Map(); // Stores messageId -> { botName, timestamp } for active claims
    }

    init(agent) {
        this.agent = agent;
        // Listen for claim confirmations from the server
        if (serverProxy && serverProxy.socket) {
            serverProxy.socket.on('response_claimed', ({ messageId, respondingBotName, originalUser, originalMessage }) => {
                this.handleResponseClaimed(messageId, respondingBotName, originalUser, originalMessage);
            });
        } else {
            console.warn(`${this.agent?.name}: ResponseCoordinator could not attach listener to serverProxy.socket`);
        }
    }

    async coordinateResponse(username, message) {
        if (!this.agent) {
            console.error("ResponseCoordinator not initialized with an agent.");
            return;
        }

        const simpleMessageId = generateMessageId(username, message); // More for local tracking before server ack

        // Avoid reprocessing if already handled or currently being handled by this agent locally
        if (respondedMessageIds.has(simpleMessageId) || processingMessageIds.has(simpleMessageId)) {
            // console.log(`${this.agent.name}: Message ${simpleMessageId} already processed or being processed.`);
            return;
        }

        console.log(`${this.agent.name} coordinating response for: ${username}: ${message}`);
        processingMessageIds.add(simpleMessageId);
        setTimeout(() => processingMessageIds.delete(simpleMessageId), MESSAGE_ID_TIMEOUT);


        // 1. Check for Self-Mention
        if (message.toLowerCase().includes(this.agent.name.toLowerCase())) {
            console.log(`${this.agent.name}: Self-mentioned, attempting to claim response for message ID ${simpleMessageId}`);
            this.attemptClaim(simpleMessageId, username, message, true); // true for high priority
            return;
        }

        // 2. No Mention - Random Selection Protocol
        const randomDelay = Math.floor(Math.random() * 1500) + 200; // 200-1700ms delay
        console.log(`${this.agent.name}: No mention detected. Waiting ${randomDelay}ms to claim message ID ${simpleMessageId}`);

        setTimeout(() => {
            // Check again if the message has been claimed by another bot in the meantime
            // This check will be more robust once server-side 'response_claimed' is fully integrated
            if (respondedMessageIds.has(simpleMessageId)) {
                // console.log(`${this.agent.name}: Message ${simpleMessageId} was claimed by another bot during delay.`);
                processingMessageIds.delete(simpleMessageId); // Clean up
                return;
            }
            console.log(`${this.agent.name}: Attempting to claim response for message ID ${simpleMessageId} after delay.`);
            this.attemptClaim(simpleMessageId, username, message, false); // false for normal priority
        }, randomDelay);
    }

    attemptClaim(messageId, originalUser, originalMessage, isMention) {
        // Check if another bot has already been confirmed for this messageId (by server)
        if (respondedMessageIds.has(messageId)) {
            // console.log(`${this.agent.name}: Claim aborted for ${messageId}, already responded by another bot.`);
            processingMessageIds.delete(messageId);
            return;
        }

        // --- Start Enhanced Debugging & Type Checking ---
        let payloadOriginalUser = String(originalUser);
        let payloadOriginalMessage = String(originalMessage);
        let payloadMessageId = String(messageId);
        let payloadBotName = String(this.agent.name);
        let payloadIsMention = Boolean(isMention);

        console.log(`${this.agent.name}: Preparing 'claim_response'. Data types:`);
        console.log(`  - messageId (${payloadMessageId.length}): ${typeof payloadMessageId}`);
        console.log(`  - botName (${payloadBotName.length}): ${typeof payloadBotName}`);
        console.log(`  - originalUser (${payloadOriginalUser.length}): ${typeof payloadOriginalUser}`);
        console.log(`  - originalMessage (${payloadOriginalMessage.length}): ${typeof payloadOriginalMessage}`);
        console.log(`  - isMention: ${typeof payloadIsMention}`);

        const claimPayload = {
            messageId: payloadMessageId,
            botName: payloadBotName,
            originalUser: payloadOriginalUser,
            originalMessage: payloadOriginalMessage,
            isMention: payloadIsMention
        };

        console.log(`${this.agent.name}: Assembled claim_response payload:`, JSON.stringify(claimPayload, null, 2));
        // --- End Enhanced Debugging & Type Checking ---

        if (serverProxy && serverProxy.socket) {
            console.log(`${this.agent.name}: Emitting 'claim_response' for messageId: ${messageId}`);
            serverProxy.socket.emit('claim_response', claimPayload);
        } else {
            console.error(`${this.agent.name}: Cannot emit 'claim_response', serverProxy.socket not available.`);
            // Fallback: if no server, and it's a mention, just handle it (for single player/testing)
            // This part might be removed if server is always required
            if (isMention) {
                 console.warn(`${this.agent.name}: No server connection, handling mentioned message locally.`);
                 this.agent.handleMessage(originalUser, originalMessage);
                 respondedMessageIds.add(messageId);
                 setTimeout(() => respondedMessageIds.delete(messageId), MESSAGE_ID_TIMEOUT);
            }
            processingMessageIds.delete(messageId);
        }
    }

    handleResponseClaimed(messageId, respondingBotName, originalUser, originalMessage) {
        console.log(`${this.agent.name}: Received 'response_claimed'. MessageId: ${messageId}, Responder: ${respondingBotName}`);
        // Add to respondedMessageIds to prevent any further local attempts or processing for this message
        respondedMessageIds.add(messageId);
        setTimeout(() => respondedMessageIds.delete(messageId), MESSAGE_ID_TIMEOUT);
        processingMessageIds.delete(messageId); // Also clear from processing

        if (respondingBotName === this.agent.name) {
            console.log(`${this.agent.name}: Confirmed to respond to messageId: ${messageId}`);
            // Ensure originalUser and originalMessage are correctly passed
            this.agent.handleMessage(originalUser, originalMessage);
        } else {
            console.log(`${this.agent.name}: Bot ${respondingBotName} is responding to messageId: ${messageId}. Standing down.`);
        }
    }

    // Call this if a message is handled through other means (e.g. direct whisper)
    markAsResponded(username, message) {
        const messageId = generateMessageId(username, message);
        respondedMessageIds.add(messageId);
        setTimeout(() => respondedMessageIds.delete(messageId), MESSAGE_ID_TIMEOUT);
    }
}

// Export a single instance
const responseCoordinator = new ResponseCoordinator();
export default responseCoordinator;
