import { ItemView, WorkspaceLeaf, MarkdownRenderer } from "obsidian";
import { CopilotService } from "./CopilotService";
import MyPlugin from "./main";

export const VIEW_TYPE_COPILOT_CHAT = "copilot-chat-view";

export class CopilotChatView extends ItemView {
    private chatHistoryEl: HTMLElement;
    private inputEl: HTMLTextAreaElement;
    private submitBtnEl: HTMLButtonElement;
    private copilotService: CopilotService | null = null;
    private currentSessionId: string;

    constructor(leaf: WorkspaceLeaf, private plugin: MyPlugin) {
        super(leaf);
        // Initialize with a fresh session ID
        this.currentSessionId = crypto.randomUUID();
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

        // Controls row
        const controlsRow = bottomContainer.createEl("div");
        controlsRow.style.display = "flex";
        controlsRow.style.justifyContent = "flex-end";

        const newChatBtnEl = controlsRow.createEl("button", { text: "New Chat" });
        newChatBtnEl.onclick = () => this.startNewChat();

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
        if (vaultPath) {
            const cliPath = this.plugin.settings.copilotCommandPath;
            const nodePath = this.plugin.settings.nodeCommandPath;
            this.copilotService = new CopilotService(vaultPath, cliPath, nodePath);
        } else {
            this.appendMessage("System", "Error: Cannot determine Vault absolute path. Copilot CLI requires it.");
            this.submitBtnEl.disabled = true;
        }
    }

    private startNewChat() {
        this.currentSessionId = crypto.randomUUID();
        this.chatHistoryEl.empty();
        this.appendMessage("System", "Started a new conversation session.");
    }

    private appendMessage(sender: "User" | "Copilot" | "System", text: string, type: "normal" | "streaming" = "normal") {
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
        return textEl;
    }

    private onSubmit() {
        const prompt = this.inputEl.value.trim();
        if (!prompt || !this.copilotService) return;

        this.inputEl.value = "";
        this.submitBtnEl.disabled = true;

        this.appendMessage("User", prompt);

        const responseTextEl = this.appendMessage("Copilot", "Thinking...", "streaming");
        let fullResponse = "";
        let isFirstChunk = true;

        this.copilotService.askCopilot(
            this.currentSessionId,
            prompt,
            (chunk) => {
                // stdout stream
                if (isFirstChunk) {
                    responseTextEl.setText("");
                    isFirstChunk = false;
                }
                fullResponse += chunk;
                responseTextEl.setText(fullResponse);
                this.chatHistoryEl.scrollTop = this.chatHistoryEl.scrollHeight;
            },
            (errChunk) => {
                // stderr stream
            },
            (code) => {
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
                }

                this.chatHistoryEl.scrollTop = this.chatHistoryEl.scrollHeight;
            }
        );
    }

    async onClose() {
        // Cleanup when closing
    }
}
