import { spawn, exec, ChildProcessWithoutNullStreams } from "child_process";
import { promisify } from "util";
import * as path from "path";

const execPromise = promisify(exec);

export class CopilotService {
    private vaultPath: string;
    private pythonPath: string;
    private wrapperPath: string;

    constructor(vaultPath: string, pluginDir: string, pythonPath: string = "python") {
        this.vaultPath = vaultPath;
        this.pythonPath = pythonPath;
        this.wrapperPath = path.join(vaultPath, pluginDir, "copilot_wrapper.py");
    }

    /**
     * Sends a prompt to the Copilot Python wrapper and streams the response back.
     * @param sessionId The UUID representing the chat session to maintain context.
     * @param prompt The question or instruction for Copilot.
     * @param model The specific model to use (e.g., "gpt-4o").
     * @param onData Callback for receiving chunks of text from stdout.
     * @param onError Callback for receiving chunks of text from stderr.
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
        const args = [this.wrapperPath];
        const commandToSpawn = this.pythonPath || "python";

        console.log(`[CopilotService] Spawning: ${commandToSpawn} ${args.join(" ")} in ${this.vaultPath}`);

        const augmentedEnv = { ...process.env };
        if (this.pythonPath && this.pythonPath !== "python" && this.pythonPath !== "python3") {
            const pythonDir = path.dirname(this.pythonPath);
            augmentedEnv.PATH = `${pythonDir}${path.delimiter}${augmentedEnv.PATH || ''}`;
        }

        const child = spawn(commandToSpawn, args, {
            cwd: this.vaultPath,
            env: augmentedEnv,
            shell: false
        });
        
        // Write the prompt to the wrapper's stdin as JSON
        const inputData = JSON.stringify({
            prompt: prompt,
            model: model,
            sessionId: sessionId
        });
        child.stdin.write(inputData);
        child.stdin.end();

        child.stdout.on("data", (data) => {
            const text = data.toString();
            console.log(`[CopilotService STDOUT]: ${text}`);
            onData(text);
        });

        child.stderr.on("data", (data) => {
            const text = data.toString();
            console.debug(`[CopilotService STDERR]: ${text}`);
            onError(text);
        });

        child.on("close", (code) => {
            console.log(`[CopilotService] Process exited with code ${code}`);
            onEnd(code);
        });

        child.on("error", (error) => {
            console.error(`[CopilotService] Failed to start subprocess: ${error.message}`);
            onError(`[Failed to start Python Wrapper]: ${error.message}\nPlease ensure Python is installed and the path is correct in settings.`);
            onEnd(-1);
        });

        return child;
    }

    /**
     * Returns a hardcoded list of available models since fetching dynamically via SDK is not exposed yet.
     */
    async getAvailableModels(): Promise<string[]> {
        return Promise.resolve([
            "gpt-4o", "gpt-4", "claude-3.5-sonnet", "claude-3.5-haiku",
            "claude-sonnet-4.6", "claude-sonnet-4.5"
        ]);
    }
}
