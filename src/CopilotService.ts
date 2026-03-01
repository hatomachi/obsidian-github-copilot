import { spawn, exec, ChildProcessWithoutNullStreams } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export class CopilotService {
    private vaultPath: string;
    private cliCommand: string;
    private nodePath: string;

    constructor(vaultPath: string, cliCommand: string = "copilot", nodePath: string = "node") {
        this.vaultPath = vaultPath;
        this.cliCommand = cliCommand; // "copilot" expects the GitHub Copilot CLI to be in the system PATH
        this.nodePath = nodePath;
    }

    /**
     * Sends a prompt to the Copilot CLI and streams the response back.
     * @param sessionId The UUID representing the chat session to maintain context.
     * @param prompt The question or instruction for Copilot.
     * @param model The specific model to use (e.g., "gpt-4").
     * @param onData Callback for receiving chunks of text from stdout.
     * @param onError Callback for receiving chunks of text from stderr (often usage stats or real errors).
     * @param onEnd Callback when the process finishes.
     */
    public askCopilot(
        sessionId: string,
        prompt: string,
        model: string,
        onData: (chunk: string) => void,
        onError: (chunk: string) => void,
        onEnd: (code: number | null) => void
    ): ChildProcessWithoutNullStreams {
        // Example invocation: node /path/to/copilot -p "your prompt here" --allow-all --resume <sessionId> --model <model>
        // The `--allow - all` flag allows the CLI to execute actions like file creation without interactive prompting.
        // `--resume <sessionId>` ensures the CLI context is maintained across multiple subprocess invocations.
        // For github-copilot-cli, non-interactive mode requires `- p` or `--prompt`.
        // Build the target command:
        // node /usr/local/bin/copilot --allow-all --resume [sessionId] --model [model] -p "[prompt]"
        const args = [
            this.cliCommand,
            '--allow-all',
            '--resume', sessionId
        ];

        if (model) {
            args.push('--model', model);
        }

        args.push('-p', prompt);

        console.log(`[CopilotService] Spawning: ${this.nodePath} ${args.join(" ")} in ${this.vaultPath} `);

        const child = spawn(this.nodePath, args, {
            cwd: this.vaultPath,
            env: process.env, // Inherit environment variables (important for PATH, auth tokens if stored in env, etc.)
        });

        child.stdout.on("data", (data) => {
            const text = data.toString();
            console.log(`[CopilotService STDOUT]: ${text} `);
            onData(text);
        });

        child.stderr.on("data", (data) => {
            const text = data.toString();
            // Copilot CLI outputs its usage statistics and non-fatal progress info to stderr.
            console.debug(`[CopilotService STDERR]: ${text} `);
            onError(text);
        });

        child.on("close", (code) => {
            console.log(`[CopilotService] Process exited with code ${code} `);
            onEnd(code);
        });

        child.on("error", (error) => {
            console.error(`[CopilotService] Failed to start subprocess: ${error.message} `);
            onError(`[Failed to start CLI]: ${error.message} \nPlease ensure Node.js('${this.nodePath}') and Copilot CLI('${this.cliCommand}') are configured correctly in Settings.`);
            onEnd(-1);
        });

        return child;
    }

    /**
     * Dynamically fetches the list of available models from the CLI's help output.
     */
    async getAvailableModels(): Promise<string[]> {
        return new Promise((resolve) => {
            const command = `"${this.nodePath}" "${this.cliCommand}" ask --help`;
            exec(command, (error, stdout, stderr) => {
                if (error && !stdout && !stderr) {
                    console.error("[CopilotService] Failed to fetch models from CLI help:", error);
                    return resolve([]);
                }

                try {
                    const text = stdout || stderr;
                    // Look for the line containing `--model <model>` and extract choices
                    // Example: --model <model>  ... (choices: "claude-sonnet-4.6", "gpt-5.2")
                    const match = text.match(/--model[\s\S]*?choices:\s*([\s\S]*?)\)/i);
                    if (match && match[1]) {
                        // match[1] looks like: "claude-sonnet-4.6", "claude-sonnet-4.5", "gpt-4.1"
                        const modelsStr = match[1];
                        const models = modelsStr
                            .split(',')
                            .map(m => m.trim().replace(/"/g, ''))
                            .filter(m => m.length > 0);

                        // Enforce some structure and unique values just in case
                        return resolve(Array.from(new Set(models)));
                    }
                } catch (e) {
                    console.error("[CopilotService] Error parsing models from CLI help:", e);
                }

                // Fallback if parsing fails or regex doesn't match
                resolve([]);
            });
        });
    }
}
