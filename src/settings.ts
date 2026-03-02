import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";

export interface ChatMessage {
	role: 'User' | 'Copilot' | 'System';
	content: string;
}

export interface MyPluginSettings {
	copilotCommandPath: string;
	nodeCommandPath: string;
	activeSessionId: string;
	chatHistory: ChatMessage[];
	copilotModel: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	copilotCommandPath: 'copilot',
	nodeCommandPath: 'node',
	activeSessionId: '',
	chatHistory: [],
	copilotModel: 'claude-sonnet-4.6'
}

export class CopilotSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Copilot JS Script Path')
			.setDesc('Absolute path to the GitHub Copilot CLI JavaScript file (e.g., /usr/local/bin/copilot or C:\\Users\\...\\npm\\node_modules\\@githubnext\\github-copilot-cli\\bin\\copilot.js). Do NOT point to .cmd or .ps1 wrappers.')
			.addText(text => text
				.setPlaceholder('copilot')
				.setValue(this.plugin.settings.copilotCommandPath)
				.onChange(async (value) => {
					this.plugin.settings.copilotCommandPath = value || 'copilot';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Node.js Path')
			.setDesc('Absolute path to the Node.js executable (e.g., /usr/local/bin/node or /opt/homebrew/bin/node). Used to inject into the PATH on macOS.')
			.addText(text => text
				.setPlaceholder('node')
				.setValue(this.plugin.settings.nodeCommandPath)
				.onChange(async (value) => {
					this.plugin.settings.nodeCommandPath = value || 'node';
					await this.plugin.saveSettings();
				}));
	}
}
