import { spawn, exec, ChildProcessWithoutNullStreams } from "child_process";
import { promisify } from "util";
import * as path from "path";

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
            '--allow-all',
            '--resume', sessionId
        ];

        let commandToSpawn = this.cliCommand;
        // Node's spawn with `shell: true` uses cmd.exe on Windows. cmd.exe cannot natively execute .ps1 files.
        const isWindowsPs1 = process.platform === 'win32' && this.cliCommand.toLowerCase().endsWith('.ps1');

        if (isWindowsPs1) {
            commandToSpawn = 'powershell.exe';
            args.unshift('-ExecutionPolicy', 'Bypass', '-File', this.cliCommand);
        }

        if (model) {
            args.push('--model', model);
        }

        args.push('-p', prompt);

        console.log(`[CopilotService] Spawning: ${this.cliCommand} ${args.join(" ")} in ${this.vaultPath} `);

        // Create an augmented environment that injects the Node.js directory into the PATH.
        // This is crucial for macOS GUI apps (like Obsidian) that don't inherit terminal PATHs (like Homebrew).
        // Since `copilot` binary is often a JS file starting with `#!/usr/bin/env node`, the OS must find `node` in PATH.
        const augmentedEnv = { ...process.env };
        if (this.nodePath && this.nodePath !== "node") {
            const nodeDir = path.dirname(this.nodePath);
            augmentedEnv.PATH = `${nodeDir}${path.delimiter}${augmentedEnv.PATH || ''}`;
        }

        const child = spawn(commandToSpawn, args, {
            cwd: this.vaultPath,
            env: augmentedEnv,
            shell: process.platform === 'win32'
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
            onError(`[Failed to start CLI]: ${error.message} \nPlease ensure Copilot CLI('${this.cliCommand}') is configured correctly in Settings.`);
            onEnd(-1);
        });

        return child;
    }

    /**
     * Dynamically fetches the list of available models from the CLI's help output.
     */
    async getAvailableModels(): Promise<string[]> {
        return new Promise((resolve) => {
            const augmentedEnv = { ...process.env };
            if (this.nodePath && this.nodePath !== "node") {
                const nodeDir = path.dirname(this.nodePath);
                augmentedEnv.PATH = `${nodeDir}${path.delimiter}${augmentedEnv.PATH || ''}`;
            }

            const isWindowsPs1 = process.platform === 'win32' && this.cliCommand.toLowerCase().endsWith('.ps1');
            const baseCommand = isWindowsPs1 ? `powershell.exe -ExecutionPolicy Bypass -File "${this.cliCommand}"` : `"${this.cliCommand}"`;
            const command = `${baseCommand} ask --help`;

            exec(
                command,
                {
                    shell: process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : undefined,
                    env: augmentedEnv // Provide full environment context for CLI execution
                },
                (error: any, stdout: string, stderr: string) => {
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
                        } else {
                            console.warn("[CopilotService] Regex failed to match model choices. CLI help output was:\n", text);
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
