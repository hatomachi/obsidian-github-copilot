import { ItemView, WorkspaceLeaf, MarkdownRenderer, TFile, EventRef } from "obsidian";
import { CopilotService } from "./CopilotService";
import MyPlugin from "./main";

export const VIEW_TYPE_COPILOT_CHAT = "copilot-chat-view";

export class CopilotChatView extends ItemView {
    private chatHistoryEl: HTMLElement;
    private inputEl: HTMLTextAreaElement;
    private submitBtnEl: HTMLButtonElement;
    private contextBarEl: HTMLElement;
    private contextCheckboxEl: HTMLInputElement;
    private contextFileLabelEl: HTMLSpanElement;
    private modelSelectEl: HTMLSelectElement;
    private activeFile: TFile | null = null;
    private leafEventRef: EventRef | null = null;
    private vaultModifyRef: EventRef | null = null;
    private vaultCreateRef: EventRef | null = null;

    private copilotService: CopilotService | null = null;
    private currentSessionId: string;
    private isProcessing: boolean = false;
    private modifiedFiles: Set<string> = new Set();

    constructor(leaf: WorkspaceLeaf, private plugin: MyPlugin) {
        super(leaf);
        this.currentSessionId = "";
    }

    getViewType() {
        return VIEW_TYPE_COPILOT_CHAT;
    }

    getDisplayText() {
        return "Copilot Chat";
    }

    async onOpen() {
        const container = this.contentEl;
        container.empty();

        container.addClass("copilot-chat-container");
        container.createEl("h4", { text: "GitHub Copilot", cls: "copilot-header" });

        // Chat History Area
        this.chatHistoryEl = container.createEl("div", { cls: "copilot-chat-history" });
        this.chatHistoryEl.style.flex = "1";
        this.chatHistoryEl.style.overflowY = "auto";
        this.chatHistoryEl.style.marginBottom = "10px";
        this.chatHistoryEl.style.padding = "10px";
        this.chatHistoryEl.style.border = "1px solid var(--background-modifier-border)";
        this.chatHistoryEl.style.userSelect = "text";
        this.chatHistoryEl.style.webkitUserSelect = "text";

        // Input Area
        const bottomContainer = container.createEl("div", { cls: "copilot-bottom-container" });
        bottomContainer.style.display = "flex";
        bottomContainer.style.flexDirection = "column";
        bottomContainer.style.gap = "10px";

        // Controls row (New Chat button)
        const controlsRow = bottomContainer.createEl("div");
        controlsRow.style.display = "flex";
        controlsRow.style.justifyContent = "flex-end";

        const newChatBtnEl = controlsRow.createEl("button", { text: "New Chat" });
        newChatBtnEl.onclick = () => this.startNewChat();

        // Context Bar (Active File & Model Selection)
        this.contextBarEl = bottomContainer.createEl("div", { cls: "copilot-context-bar" });
        this.contextBarEl.style.display = "flex";
        this.contextBarEl.style.alignItems = "center";
        this.contextBarEl.style.gap = "8px";
        this.contextBarEl.style.fontSize = "0.85em";
        this.contextBarEl.style.color = "var(--text-muted)";

        const fileContextWrapper = this.contextBarEl.createEl("div");
        fileContextWrapper.style.display = "flex";
        fileContextWrapper.style.alignItems = "center";
        fileContextWrapper.style.gap = "4px";

        this.contextCheckboxEl = fileContextWrapper.createEl("input", { type: "checkbox" });
        this.contextCheckboxEl.checked = true;
        this.contextCheckboxEl.title = "Include the active file as context in your message";

        this.contextFileLabelEl = fileContextWrapper.createEl("span", { text: "No active file" });

        // Spacer to push select to the right
        const spacer = this.contextBarEl.createEl("div");
        spacer.style.flex = "1";

        this.modelSelectEl = this.contextBarEl.createEl("select");
        this.modelSelectEl.style.fontSize = "0.9em";
        this.modelSelectEl.style.maxWidth = "150px";

        // Initial Loading State
        const loadingOption = this.modelSelectEl.createEl("option", { value: "", text: "Loading models..." });

        this.modelSelectEl.addEventListener("change", async () => {
            if (this.modelSelectEl.value) {
                this.plugin.settings.copilotModel = this.modelSelectEl.value;
                await this.plugin.saveSettings();
            }
        });

        // Input row
        const inputRow = bottomContainer.createEl("div");
        inputRow.style.display = "flex";
        inputRow.style.gap = "10px";

        this.inputEl = inputRow.createEl("textarea", {
            placeholder: "Ask Copilot to edit your files...",
            cls: "copilot-chat-input"
        });
        this.inputEl.style.flexGrow = "1";
        this.inputEl.style.resize = "vertical";

        this.submitBtnEl = inputRow.createEl("button", { text: "Send" });
        this.submitBtnEl.addEventListener("click", () => this.onSubmit());

        // Initialize Service
        const vaultPath = this.plugin.getVaultAbsolutePath();
        const pluginDir = this.plugin.manifest.dir || "";
        if (vaultPath) {
            const pythonPath = this.plugin.settings.pythonCommandPath;
            this.copilotService = new CopilotService(vaultPath, pluginDir, pythonPath);
        } else {
            this.appendMessage("System", "Error: Cannot determine Vault absolute path. Copilot CLI requires it.");
            this.submitBtnEl.disabled = true;
        }

        // Register active leaf change listener
        this.updateActiveFile();
        this.leafEventRef = this.plugin.app.workspace.on('active-leaf-change', () => this.updateActiveFile());

        // Register vault listeners for Copilot file modifications
        this.vaultModifyRef = this.plugin.app.vault.on('modify', (file: TFile) => this.onVaultChange(file));
        this.vaultCreateRef = this.plugin.app.vault.on('create', (file: TFile) => this.onVaultChange(file));

        // Restore Session ID and Chat History
        if (!this.plugin.settings.activeSessionId) {
            this.plugin.settings.activeSessionId = crypto.randomUUID();
            this.plugin.saveSettings();
        }
        this.currentSessionId = this.plugin.settings.activeSessionId;

        this.restoreChatHistory();

        // Fetch Dynamic Models
        if (this.copilotService) {
            this.copilotService.getAvailableModels().then((models: string[]) => {
                this.modelSelectEl.empty();

                if (models.length === 0) {
                    // Fallback to static list if parsing failed
                    models = [
                        "claude-sonnet-4.6", "claude-sonnet-4.5", "claude-haiku-4.5",
                        "claude-opus-4.6", "claude-opus-4.6-fast", "claude-opus-4.5",
                        "claude-sonnet-4", "gemini-3-pro-preview", "gpt-5.3-codex",
                        "gpt-5.2-codex", "gpt-5.2", "gpt-5.1-codex-max",
                        "gpt-5.1-codex", "gpt-5.1", "gpt-5.1-codex-mini",
                        "gpt-5-mini", "gpt-4.1"
                    ];
                }

                for (const modelId of models) {
                    const option = this.modelSelectEl.createEl("option", { value: modelId, text: modelId });
                    if (this.plugin.settings.copilotModel === modelId) {
                        option.selected = true;
                    }
                }

                // If the previously saved model isn't in the list, set it to the first available
                if (!models.includes(this.plugin.settings.copilotModel) && models.length > 0) {
                    const fallbackModel = models[0] || "claude-sonnet-4.6";
                    this.modelSelectEl.value = fallbackModel;
                    this.plugin.settings.copilotModel = fallbackModel;
                    this.plugin.saveSettings();
                }
            });
        }
    }

    private restoreChatHistory() {
        const history = this.plugin.settings.chatHistory || [];
        for (const msg of history) {
            const responseTextEl = this.appendMessage(msg.role, msg.content, "normal", false);
            if (msg.role === "Copilot") {
                responseTextEl.empty();
                responseTextEl.style.whiteSpace = "normal";
                MarkdownRenderer.render(this.plugin.app, msg.content, responseTextEl, "", this);
            }
        }
    }

    private onVaultChange(file: TFile) {
        if (this.isProcessing) {
            this.modifiedFiles.add(file.path);
        }
    }

    private updateActiveFile() {
        const file = this.plugin.app.workspace.getActiveFile();
        this.activeFile = file;

        if (file) {
            this.contextFileLabelEl.setText(`Current File: ${file.name}`);
            this.contextCheckboxEl.disabled = false;
        } else {
            this.contextFileLabelEl.setText("No active file");
            this.contextCheckboxEl.disabled = true;
            this.contextCheckboxEl.checked = false; // Uncheck if no file
        }
    }

    private async startNewChat() {
        this.currentSessionId = crypto.randomUUID();
        this.plugin.settings.activeSessionId = this.currentSessionId;
        this.plugin.settings.chatHistory = [];
        await this.plugin.saveSettings();

        this.chatHistoryEl.empty();
        this.appendMessage("System", "Started a new conversation session.", "normal", true);
    }

    private appendMessage(sender: "User" | "Copilot" | "System", text: string, type: "normal" | "streaming" = "normal", save: boolean = false) {
        const msgEl = this.chatHistoryEl.createEl("div", { cls: `copilot-msg copilot-msg-${sender.toLowerCase()}` });
        msgEl.style.marginBottom = "10px";

        const senderEl = msgEl.createEl("div", { text: `${sender}` }); // Changed to div for block layout
        senderEl.style.fontWeight = "bold";
        senderEl.style.marginBottom = "4px";

        if (sender === "System") {
            senderEl.style.color = "var(--text-muted)";
        }

        const textEl = msgEl.createEl("div"); // Use div for valid Markdown block elements integration
        textEl.style.whiteSpace = "pre-wrap";
        textEl.setText(text);

        if (sender === "System") {
            textEl.style.color = "var(--text-muted)";
            textEl.style.fontStyle = "italic";
        }

        this.chatHistoryEl.scrollTop = this.chatHistoryEl.scrollHeight;

        if (save) {
            this.plugin.settings.chatHistory.push({ role: sender, content: text });
            this.plugin.saveSettings(); // Fire and forget save
        }

        return textEl;
    }

    private onSubmit() {
        const prompt = this.inputEl.value.trim();
        if (!prompt || !this.copilotService) return;

        this.inputEl.value = "";
        this.submitBtnEl.disabled = true;

        // Display only user's actual prompt in UI, save it to history
        this.appendMessage("User", prompt, "normal", true);

        // Build CLI command prompt
        let finalPrompt = prompt;
        if (this.contextCheckboxEl.checked && this.activeFile && !this.contextCheckboxEl.disabled) {
            const vaultPath = this.plugin.getVaultAbsolutePath();
            if (vaultPath) {
                // @ts-ignore - obsidian runtime provides path natively on desktop
                const fullPath = this.activeFile.path ? `${vaultPath}/${this.activeFile.path}` : null;
                if (fullPath) {
                    finalPrompt = `[System: The user is currently viewing the file at ${fullPath}. Consider this file as the primary context if the user refers to 'this file' or 'current file'.]\n\n${prompt}`;
                }
            }
        }

        const responseTextEl = this.appendMessage("Copilot", "Thinking...", "streaming");
        let fullResponse = "";
        let isFirstChunk = true;

        this.isProcessing = true;
        this.modifiedFiles.clear();

        this.copilotService.askCopilot(
            this.currentSessionId,
            finalPrompt,
            this.plugin.settings.copilotModel,
            (chunk: string) => {
                // stdout stream
                if (isFirstChunk) {
                    responseTextEl.setText("");
                    isFirstChunk = false;
                }
                fullResponse += chunk;
                responseTextEl.setText(fullResponse);
                this.chatHistoryEl.scrollTop = this.chatHistoryEl.scrollHeight;
            },
            (errChunk: string) => {
                // stderr stream
            },
            (code: number | null) => {
                this.submitBtnEl.disabled = false;

                if (isFirstChunk) {
                    responseTextEl.setText(""); // remove thinking
                }

                if (code !== 0 && code !== null) {
                    this.appendMessage("System", `Process encountered an error (exited with code ${code}). Check developer console for more details.`);
                }

                if (fullResponse.trim() === "" && code === 0) {
                    responseTextEl.setText("(No text response. The command might have executed silently.)");
                } else if (!isFirstChunk && fullResponse.trim() !== "") {
                    // Finished successfully: Render the accumulated text as Markdown
                    responseTextEl.empty(); // clear plain text
                    responseTextEl.style.whiteSpace = "normal"; // allow normal HTML wrapping for rendered markdown
                    MarkdownRenderer.render(this.plugin.app, fullResponse, responseTextEl, "", this);

                    // Manually push Copilot's final response to history and save
                    this.plugin.settings.chatHistory.push({ role: 'Copilot', content: fullResponse });
                    this.plugin.saveSettings();
                }

                // Give file I/O a tiny bit of breathing room to trigger Obsidian events before checking
                setTimeout(() => {
                    this.isProcessing = false;
                    if (this.modifiedFiles.size > 0) {
                        const fileList = Array.from(this.modifiedFiles).join(", ");
                        this.appendMessage("System", `📝 Copilot modified: ${fileList}`, "normal", true);
                        this.chatHistoryEl.scrollTop = this.chatHistoryEl.scrollHeight;
                    }
                }, 500);

                this.chatHistoryEl.scrollTop = this.chatHistoryEl.scrollHeight;
            }
        );
    }

    async onClose() {
        if (this.leafEventRef) {
            this.plugin.app.workspace.offref(this.leafEventRef);
            this.leafEventRef = null;
        }
        if (this.vaultModifyRef) {
            this.plugin.app.vault.offref(this.vaultModifyRef);
            this.vaultModifyRef = null;
        }
        if (this.vaultCreateRef) {
            this.plugin.app.vault.offref(this.vaultCreateRef);
            this.vaultCreateRef = null;
        }
    }
}
