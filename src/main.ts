import { App, Editor, MarkdownView, Modal, Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, MyPluginSettings, CopilotSettingTab } from "./settings";
import { CopilotChatView, VIEW_TYPE_COPILOT_CHAT } from "./CopilotChatView";

// Remember to rename these classes and interfaces!

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_COPILOT_CHAT,
			(leaf) => new CopilotChatView(leaf, this)
		);

		// Get Vault base path
		// Obsidian API: this.app.vault.adapter.getBasePath() is available on Desktop
		const vaultPath = this.getVaultAbsolutePath();
		if (vaultPath) {
			console.log(`[Copilot CLI Plugin] Vault absolute path: ${vaultPath}`);
		} else {
			console.log(`[Copilot CLI Plugin] Unable to get Vault absolute path. Adapter does not support getBasePath.`);
		}

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('message-square', 'Open Copilot Chat', (evt: MouseEvent) => {
			this.activateView();
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status bar text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-modal-simple',
			name: 'Open modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'replace-selected',
			name: 'Replace selected content',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				editor.replaceSelection('Sample editor command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-modal-complex',
			name: 'Open modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
				return false;
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new CopilotSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MyPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	getVaultAbsolutePath(): string | null {
		const adapter = this.app.vault.adapter as any;
		if (adapter.getBasePath) {
			return adapter.getBasePath();
		}
		return null;
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | undefined | null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_COPILOT_CHAT);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_COPILOT_CHAT, active: true });
			}
		}

		if (leaf) {
			// "Reveal" the leaf in case it is in a collapsed sidebar
			workspace.revealLeaf(leaf);
		}
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		let { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
