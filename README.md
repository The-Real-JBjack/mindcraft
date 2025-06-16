# Mindcraft 🧠⛏️

Crafting minds for Minecraft with LLMs and [Mineflayer!](https://prismarinejs.github.io/mineflayer/#/)
Recent enhancements include faster Text-to-Speech (TTS) output and new Speech-to-Text (STT) capabilities for voice commands.

[FAQ](https://github.com/kolbytn/mindcraft/blob/main/FAQ.md) | [Discord Support](https://discord.gg/mp73p35dzC) | [Video Tutorial](https://www.youtube.com/watch?v=gRotoL8P8D8) | [Blog Post](https://kolbynottingham.com/mindcraft/) | [Contributor TODO](https://github.com/users/kolbytn/projects/1) | [Paper Website](https://mindcraft-minecollab.github.io/index.html) | [MineCollab](https://github.com/kolbytn/mindcraft/blob/main/minecollab.md) 


> [!Caution]
Do not connect this bot to public servers with coding enabled. This project allows an LLM to write/execute code on your computer. The code is sandboxed, but still vulnerable to injection attacks. Code writing is disabled by default, you can enable it by setting `allow_insecure_coding` to `true` in `settings.js`. Ye be warned.

## Requirements

- [Minecraft Java Edition](https://www.minecraft.net/en-us/store/minecraft-java-bedrock-edition-pc) (up to v1.21.1, recommend v1.21.1)
- [Node.js Installed](https://nodejs.org/) (at least v18)
- One of these: [OpenAI API Key](https://openai.com/blog/openai-api) | [Gemini API Key](https://aistudio.google.com/app/apikey) | [Anthropic API Key](https://docs.anthropic.com/claude/docs/getting-access-to-claude) | [Replicate API Key](https://replicate.com/) | [Hugging Face API Key](https://huggingface.co/) | [Groq API Key](https://console.groq.com/keys) | [Ollama Installed](https://ollama.com/download). | [Mistral API Key](https://docs.mistral.ai/getting-started/models/models_overview/) | [Qwen API Key [Intl.]](https://www.alibabacloud.com/help/en/model-studio/developer-reference/get-api-key)/[[cn]](https://help.aliyun.com/zh/model-studio/getting-started/first-api-call-to-qwen?) | [Novita AI API Key](https://novita.ai/settings?utm_source=github_mindcraft&utm_medium=github_readme&utm_campaign=link#key-management) |

## Install and Run

1. Make sure you have the requirements above.

2. Clone or download this repository (big green button) 'git clone https://github.com/kolbytn/mindcraft.git'

3. Rename `keys.example.json` to `keys.json` and fill in your API keys (you only need one). The desired model is set in `andy.json` or other profiles. For other models refer to the table below.

4. In terminal/command prompt, run `npm install` from the installed directory

5. Start a minecraft world and open it to LAN on localhost port `55916`

6. Run `node main.js` from the installed directory

If you encounter issues, check the [FAQ](https://github.com/kolbytn/mindcraft/blob/main/FAQ.md) or find support on [discord](https://discord.gg/mp73p35dzC). We are currently not very responsive to github issues. To run tasks please refer to [Minecollab Instructions](minecollab.md#installation)

## Tasks

Bot performance can be roughly evaluated with Tasks. Tasks automatically intialize bots with a goal to aquire specific items or construct predefined buildings, and remove the bot once the goal is achieved.

To run tasks, you need python, pip, and optionally conda. You can then install dependencies with `pip install -r requirements.txt`. 

Tasks are defined in json files in the `tasks` folder, and can be run with: `python tasks/run_task_file.py --task_path=tasks/example_tasks.json`

For full evaluations, you will need to [download and install the task suite. Full instructions.](minecollab.md#installation)

## Model Customization

You can configure project details in `settings.js`. [See file.](settings.js)

You can configure the agent's name, model, and prompts in their profile like `andy.json` with the `model` field. For comprehensive details, see [Model Specifications](#model-specifications).

### Agent Behavior Settings in `settings.js`

Several options in `settings.js` allow you to customize the agent's behavior and chat output:

*   `hideLLMCommands` (boolean, default: `true`): When true, commands decided by the agent (LLM) will not be displayed in the chat. The agent will still perform the action, but the command itself (e.g., `!move(10,0,1)`) won't appear. Set to `false` to see these commands in chat, which will then be subject to the `verbose_commands` setting.
*   `verbose_commands` (boolean, default: `true`): When agent commands *are* shown (i.e., `hideLLMCommands` is `false`, or for player-issued commands that are echoed), this setting controls whether the full command syntax is shown or a summarized version (e.g., `*used move*`).
*   `narrate_behavior` (boolean, default: `true`): Allows the agent to chat about simple automatic actions (e.g., "Picking up item!").
*   `chat_bot_messages` (boolean, default: `true`): Allows the agent to publicly chat messages to other bots (if not engaged in a direct conversation).
*   `speak` (boolean, default: `false`): Enables system Text-to-Speech (TTS) for the agent's open chat messages.
*   `stt.enabled` (boolean, default: `false`): Enables Speech-to-Text (STT) for voice commands (see [Speech-to-Text (STT) / Voice Commands](#speech-to-text-stt--voice-commands) section for more details).

| API | Config Variable | Example Model name | Docs |
|------|------|------|------|
| `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` | [docs](https://platform.openai.com/docs/models) |
| `google` | `GEMINI_API_KEY` | `gemini-2.0-flash` | [docs](https://ai.google.dev/gemini-api/docs/models/gemini) |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-3-haiku-20240307` | [docs](https://docs.anthropic.com/claude/docs/models-overview) |
| `xai` | `XAI_API_KEY` | `grok-2-1212` | [docs](https://docs.x.ai/docs) |
| `deepseek` | `DEEPSEEK_API_KEY` | `deepseek-chat` | [docs](https://api-docs.deepseek.com/) |
| `ollama` (local) | n/a | `ollama/llama3.1` | [docs](https://ollama.com/library) |
| `qwen` | `QWEN_API_KEY` | `qwen-max` | [Intl.](https://www.alibabacloud.com/help/en/model-studio/developer-reference/use-qwen-by-calling-api)/[cn](https://help.aliyun.com/zh/model-studio/getting-started/models) |
| `mistral` | `MISTRAL_API_KEY` | `mistral-large-latest` | [docs](https://docs.mistral.ai/getting-started/models/models_overview/) |
| `replicate` | `REPLICATE_API_KEY` | `replicate/meta/meta-llama-3-70b-instruct` | [docs](https://replicate.com/collections/language-models) |
| `groq` (not grok) | `GROQCLOUD_API_KEY` | `groq/mixtral-8x7b-32768` | [docs](https://console.groq.com/docs/models) |
| `huggingface` | `HUGGINGFACE_API_KEY` | `huggingface/mistralai/Mistral-Nemo-Instruct-2407` | [docs](https://huggingface.co/models) |
| `novita` | `NOVITA_API_KEY` | `novita/deepseek/deepseek-r1` | [docs](https://novita.ai/model-api/product/llm-api?utm_source=github_mindcraft&utm_medium=github_readme&utm_campaign=link) |
| `openrouter` | `OPENROUTER_API_KEY` | `openrouter/anthropic/claude-3.5-sonnet` | [docs](https://openrouter.ai/models) |
| `glhf.chat` | `GHLF_API_KEY` | `glhf/hf:meta-llama/Llama-3.1-405B-Instruct` | [docs](https://glhf.chat/user-settings/api) |
| `hyperbolic` | `HYPERBOLIC_API_KEY` | `hyperbolic/deepseek-ai/DeepSeek-V3` | [docs](https://docs.hyperbolic.xyz/docs/getting-started) |
| `vllm` | n/a | `vllm/llama3` | n/a |

If you use Ollama, to install the models used by default (generation and embedding), execute the following terminal command:
`ollama pull llama3.1 && ollama pull nomic-embed-text`

## Speech-to-Text (STT) / Voice Commands

Mindcraft now supports Speech-to-Text (STT), allowing you to issue commands to your bot using your voice.

### Configuration

To use STT, you'll need to configure it in `settings.js`:

```javascript
// settings.js
// ... other settings ...
stt: {
    enabled: false, // Set to true to enable STT
    provider: 'google', // Currently a placeholder for future expansion (e.g., 'google', 'whisper')
    apiKeyPath: process.env.STT_API_KEY_PATH || 'path/to/your/stt-api-key.json', // Path to your STT service API key file
    languageCode: 'en-US' // Language code for STT (e.g., 'en-US', 'es-ES')
},
// ... rest of settings ...
```

-   `stt.enabled` (boolean): Set to `true` to enable STT. Defaults to `false`.
-   `stt.provider` (string): Specifies the STT provider. This is for future expansion and currently does not change STT engine behavior.
-   `stt.apiKeyPath` (string): The path to your STT service API key JSON file.
    -   **Important**: You need to provide a valid API key file for the STT service you intend to use (the specific service integration is still pending).
    -   Update your `keys.json` file by copying from `keys.example.json` and adding your actual key path, or set the `STT_API_KEY_PATH` environment variable:
        ```json
        // keys.json
        {
          // ... existing keys ...
          "STT_API_KEY_PATH": "actual/path/to/your/stt-api-key.json"
        }
        ```
-   `stt.languageCode` (string): The language code for speech recognition (e.g., "en-US", "fr-FR").

### Usage

Once configured and enabled, you can control STT using the following chat commands:

-   `!sttListen`: Type this command in chat to make the bot start listening for voice input. The transcribed text will be processed as if you typed it.
-   `!sttStop`: Type this command to make the bot stop listening.

The actual STT processing (e.g., which cloud service is used) will depend on the specific STT implementation details added to `src/agent/stt.js`.

### Online Servers
To connect to online servers your bot will need an official Microsoft/Minecraft account. You can use your own personal one, but will need another account if you want to connect too and play with it. To connect, change these lines in `settings.js`:
```javascript
"host": "111.222.333.444",
"port": 55920,
"auth": "microsoft",

// rest is same...
```
> [!Important]
> The bot's name in the profile.json must exactly match the Minecraft profile name! Otherwise the bot will spam talk to itself.

To use different accounts, Mindcraft will connect with the account that the Minecraft launcher is currently using. You can switch accounts in the launcer, then run `node main.js`, then switch to your main account after the bot has connected.

### Docker Container

If you intend to `allow_insecure_coding`, it is a good idea to run the app in a docker container to reduce risks of running unknown code. This is strongly recommended before connecting to remote servers.

```bash
docker run -i -t --rm -v $(pwd):/app -w /app -p 3000-3003:3000-3003 node:latest node main.js
```
or simply
```bash
docker-compose up
```

When running in docker, if you want the bot to join your local minecraft server, you have to use a special host address `host.docker.internal` to call your localhost from inside your docker container. Put this into your [settings.js](settings.js):

```javascript
"host": "host.docker.internal", // instead of "localhost", to join your local minecraft from inside the docker container
```

To connect to an unsupported minecraft version, you can try to use [viaproxy](services/viaproxy/README.md)

# Bot Profiles

Bot profiles are json files (such as `andy.json`) that define:

1. Bot backend LLMs to use for talking, coding, and embedding.
2. Prompts used to influence the bot's behavior.
3. Examples help the bot perform tasks.

## Model Specifications

LLM models can be specified simply as `"model": "gpt-4o"`. However, you can use different models for chat, coding, and embeddings. 
You can pass a string or an object for these fields. A model object must specify an `api`, and optionally a `model`, `url`, and additional `params`.

```json
"model": {
  "api": "openai",
  "model": "gpt-4o",
  "url": "https://api.openai.com/v1/",
  "params": {
    "max_tokens": 1000,
    "temperature": 1
  }
},
"code_model": {
  "api": "openai",
  "model": "gpt-4",
  "url": "https://api.openai.com/v1/"
},
"vision_model": {
  "api": "openai",
  "model": "gpt-4o",
  "url": "https://api.openai.com/v1/"
},
"embedding": {
  "api": "openai",
  "url": "https://api.openai.com/v1/",
  "model": "text-embedding-ada-002"
}

```

`model` is used for chat, `code_model` is used for newAction coding, `vision_model` is used for image interpretation, and `embedding` is used to embed text for example selection. If `code_model` or `vision_model` is not specified, `model` will be used by default. Not all APIs support embeddings or vision.

All apis have default models and urls, so those fields are optional. The `params` field is optional and can be used to specify additional parameters for the model. It accepts any key-value pairs supported by the api. Is not supported for embedding models.

## Embedding Models

Embedding models are used to embed and efficiently select relevant examples for conversation and coding.

Supported Embedding APIs: `openai`, `google`, `replicate`, `huggingface`, `novita`

If you try to use an unsupported model, then it will default to a simple word-overlap method. Expect reduced performance, recommend mixing APIs to ensure embedding support.

## Specifying Profiles via Command Line

By default, the program will use the profiles specified in `settings.js`. You can specify one or more agent profiles using the `--profiles` argument: `node main.js --profiles ./profiles/andy.json ./profiles/jill.json`

## Interacting with Multiple Agents in Public Chat

When multiple agent profiles are active (configured by listing multiple profile files in `settings.js`), they use a **Hybrid Coordination Model** for public player chat messages. This model aims for both efficiency with simple tasks and collaborative depth for complex ones. All internal bot-to-bot messages for coordination are prefixed (e.g., `(EXECUTE_TASK)`) and are not directly visible in the player chat.

Here's the process:

1.  **Initial Processing Bot (IPB) Determination**:
    *   When a player sends a public chat message, one agent is designated as the "Initial Processing Bot" (IPB).
    *   If the player's message explicitly mentions an online agent by name (e.g., "Andy, come here"), that agent becomes the IPB.
    *   If no specific agent is mentioned, the agent whose name is alphabetically first among all currently online agents becomes the IPB (this agent also serves as the "Default Coordinator" for full discussions).

2.  **IPB's Internal Assessment**:
    *   The IPB performs an internal AI-driven assessment of the player's message. This assessment (invisible to player chat) categorizes the message to decide the best way to handle it:
        *   **`SELF_SIMPLE` (Fast Path - IPB Handles Directly)**: If the IPB determines the task is simple and best handled by itself, it will proceed to execute the task or respond directly.
            *   *Internal Communication*: If the IPB is not the Default Coordinator, it silently informs the Default Coordinator with an `(INFO_HANDLING_DIRECT_TASK)` message.
        *   **`OTHER_SIMPLE` (Fast Path - IPB Delegates Simply)**: If the IPB assesses the task as simple and clearly suited for another specific online teammate, it will directly delegate the task to that teammate.
            *   *Internal Communication*: The IPB sends an `(EXECUTE_TASK)` directive to the chosen teammate. If neither the IPB nor the target bot is the Default Coordinator, the IPB also sends an `(INFO_DELEGATED_SIMPLE_TASK)` message to the Default Coordinator.
        *   **`TEAM_DISCUSS` (Full Discussion Path)**: If the IPB deems the task complex, vague, or requiring broader team input, it triggers a full team discussion.
            *   *Triggering Full Discussion*:
                *   If the IPB *is* the Default Coordinator, it initiates the full team discussion process directly (see step 3).
                *   If the IPB is *not* the Default Coordinator, it sends an internal `(REQUEST_COORDINATION)` message to the Default Coordinator, asking them to start the full team discussion.

3.  **Full Team Discussion (if triggered by `TEAM_DISCUSS` assessment)**:
    *   **Coordinator Initiates**: The Default Coordinator sends a `(TEAM_COORDINATION)` message to all other online team members, quoting the original player's message and asking for suggestions on how to proceed and who should handle the task.
    *   **Team Members Suggest**: Each team member analyzes the request and sends their suggestion back to the Default Coordinator via a direct internal message.
    *   **Coordinator Decides & Delegates**: The Default Coordinator gathers all suggestions. Using its AI, it considers the original request and the team's input to decide which agent is best suited and what the action/response should be. It then informs the chosen agent via an `(EXECUTE_TASK)` directive.

4.  **User Interaction & Tips**:
    *   You can speak to the group of agents in public chat. The system will attempt to route your request efficiently.
    *   **Response Time**:
        *   For simple, clearly addressed tasks, the IPB mechanism aims for a "fast path" response, which should be relatively quick.
        *   If a "full team discussion" is triggered, responses will take longer (e.g., 10-20 seconds or more) due to the internal coordination process.
    *   **Helping the Team Decide**:
        *   **Direct Mentions**: If you want a specific bot to handle a task, mentioning its name (e.g., "Lexi, please build a wall") makes it the IPB and can help the AI assess it as `SELF_SIMPLE` or `OTHER_SIMPLE` for a faster outcome.
        *   **Clarity**: Clear and concise requests are easier for the IPB to assess.
        *   **Group Tasks**: Using terms like 'team,' 'everyone,' or 'all bots' can signal a task for group consideration, likely leading to a `TEAM_DISCUSS` assessment by the IPB.
    *   **Direct Messages**: Whispers or direct messages (e.g., `/msg AgentName Your message`) to a specific agent will always bypass this team coordination logic and be processed only by that agent immediately. This remains the most reliable way to give specific instructions to individual agents without delay.

5.  **Experimental Feature**:
    *   This hybrid coordination model is an advanced and experimental feature. The goal is to achieve intelligent and flexible teamwork. However, the process is complex, and the AI's assessment or decisions might not always be perfect. Prompts guiding these interactions are in `profiles/defaults/_default.json` and can be customized.

Patience is appreciated as the agents (especially the IPB and Coordinator) deliberate and manage team responses!

## Patches

Some of the node modules that we depend on have bugs in them. To add a patch, change your local node module file and run `npx patch-package [package-name]`

## Citation:

```
@article{mindcraft2025,
  title = {Collaborating Action by Action: A Multi-agent LLM Framework for Embodied Reasoning},
  author = {White*, Isadora and Nottingham*, Kolby and Maniar, Ayush and Robinson, Max and Lillemark, Hansen and Maheshwari, Mehul and Qin, Lianhui and Ammanabrolu, Prithviraj},
  journal = {arXiv preprint arXiv:2504.17950},
  year = {2025},
  url = {https://arxiv.org/abs/2504.17950},
}
```
