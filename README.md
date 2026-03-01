# Obsidian GitHub Copilot Chat

This plugin provides a seamless right-pane chat interface for interacting with the **GitHub Copilot CLI** directly from within Obsidian. Instead of leaving your vault to jump into a terminal, you can interact with Copilot to draft documents, edit files, and bounce ideas off an AI that understands your local workspace.

## Features
- **Chat Interface**: Open the Copilot Chat view from the ribbon icon to start asking questions.
- **Contextual Sessions & History Persistence**: The plugin remembers conversation context using active session UUIDs and saves your chat history across Obsidian restarts.
- **Active File Context**: Automatically detects the active markdown file you are viewing and lets you easily include it in the Prompt context.
- **Markdown Rendering**: Beautifully renders Copilot’s responses into rich Obsidian Markdown after streaming completes.
- **File Manipulation & Change Detection**: Authorizes Copilot's CLI `--allow-all` flag out of the box, letting it directly create or rewrite `.md` files in your vault. Obsidian instantly syncs these file updates natively and displays system notifications in the chat when files are altered.
- **Configurable Environments**: Supports overriding the exact path to `copilot` and `node` so the plugin works reliably across different developer environments where `$PATH` may not apply to GUI apps.

## Prerequisites
1. **GitHub Copilot CLI must be installed.** You can install it via npm:
   ```bash
   npm install -g @github/copilot
   ```
2. **You must be authenticated with Copilot.** Run the login command in your terminal before using the plugin:
   ```bash
   copilot --login
   ```

## Configuration
After installing and enabling the plugin, go to Obsidian **Settings > GitHub Copilot Chat**:
1. `Copilot CLI Command Path`: Enter the absolute path to your `copilot` binary. (Find it using `which copilot` in your terminal).
2. `Node.js Path`: Enter the absolute path to your `node` binary. (Find it using `which node` in your terminal).

*If you don't configure these paths, the plugin will attempt to use simple command names (`node`, `copilot`), but this often fails in macOS/Windows GUI environments that do not inherit terminal `$PATH`s.*

## How to use
- Click the **message-square** icon in the left ribbon to open the Copilot Chat pane.
- Type prompts like `"Create a new file called architecture_ideas.md and write a summary."`
- Clear the chat context with the `New Chat` button when switching to drastically different topics.

## Development setup
1. Run `npm i` to install dependencies.
2. Run `npm run dev` to watch for local changes.
3. Reload Obsidian.
