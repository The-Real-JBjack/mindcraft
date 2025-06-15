function sendBaritoneCommand(agent, command) {
  return new Promise((resolve, reject) => {
    const commandId = `baritone_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const prefixedCommand = `#${command}`;

    const timeout = setTimeout(() => {
      if (agent.pendingBaritoneCommands[commandId]) {
        delete agent.pendingBaritoneCommands[commandId];
        reject(new Error(`Baritone command "${prefixedCommand}" timed out after 30 seconds`));
      }
    }, 30000); // 30 seconds timeout

    agent.pendingBaritoneCommands[commandId] = { resolve, reject, timeout, command: prefixedCommand };

    agent.openChat(prefixedCommand);
    console.log(`Sent Baritone command: ${prefixedCommand} (ID: ${commandId})`);
  });
}

module.exports = { sendBaritoneCommand };
