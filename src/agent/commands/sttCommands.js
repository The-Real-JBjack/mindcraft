import { startListening, stopListening, isListening } from '../stt.js';
import settings from '../../../settings.js';
// Assuming agent.handleMessage is the correct way to send a message as if typed by the player.
// This might need adjustment based on the actual agent architecture.
// For now, we'll rely on the agent instance being passed to the perform method.

const sttListenCommand = {
  name: "!sttListen",
  description: "Starts capturing audio for Speech-to-Text. The transcribed text will be treated as a player message.",
  params: {},
  perform: (agentInstance) => {
    if (!settings.stt || !settings.stt.enabled) {
      return "STT is not enabled in settings.";
    }
    if (isListening()) {
      return "STT is already listening.";
    }

    startListening(async (transcribedText) => {
      if (agentInstance && typeof agentInstance.handleMessage === 'function') {
        agentInstance.isProcessingSTT = true;
        try {
          // Simulate the player sending the transcribed text as a chat message
          await agentInstance.handleMessage('player', transcribedText);
        } catch (error) {
          console.error("Error processing transcribed text in sttListenCommand:", error);
        } finally {
          agentInstance.isProcessingSTT = false;
        }
      } else {
        console.error("Agent instance or handleMessage function is not available in sttListenCommand callback.");
        // Fallback or error handling if agentInstance.handleMessage is not available
        // This could be a message back to the user if possible, or just a log.
      }
    });

    return "STT listening started. Say your command.";
  }
};

const sttStopCommand = {
  name: "!sttStop",
  description: "Stops capturing audio for Speech-to-Text.",
  params: {},
  perform: (agentInstance) => { // agentInstance might not be needed here but kept for consistency
    if (!isListening()) {
      return "STT is not currently listening.";
    }
    stopListening();
    return "STT listening stopped.";
  }
};

export const sttCommandsList = [sttListenCommand, sttStopCommand];
