import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";

export interface ChatMessage {
	role: 'User' | 'Copilot' | 'System';
	content: string;
}

export interface MyPluginSettings {
	pythonCommandPath: string;
	activeSessionId: string;
	chatHistory: ChatMessage[];
	copilotModel: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	pythonCommandPath: 'python3',
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
			.setName('Python Path')
			.setDesc('Absolute path to the Python executable or simply "python" or "python3" if it is in your PATH. Used to execute the copilot_wrapper.py script.')
			.addText(text => text
				.setPlaceholder('python3')
				.setValue(this.plugin.settings.pythonCommandPath)
				.onChange(async (value) => {
					this.plugin.settings.pythonCommandPath = value || 'python3';
					await this.plugin.saveSettings();
				}));
	}
}
