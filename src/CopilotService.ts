import { ChildProcessWithoutNullStreams } from "child_process";
import * as path from "path";
const { exec } = require('child_process');

export class CopilotService {
    private vaultPath: string;
    private pythonPath: string;
    private wrapperPath: string;

    constructor(vaultPath: string, pluginDir: string, pythonPath: string = "python3") {
        this.vaultPath = vaultPath;
        this.pythonPath = pythonPath;
        this.wrapperPath = path.join(vaultPath, pluginDir, "copilot_wrapper.py");
    }

    /**
     * Sends a prompt to the Copilot Python wrapper.
     * Uses `exec` to wait for the entire response to simplify cross-platform execution.
     */
    public askCopilot(
        sessionId: string,
        prompt: string,
        model: string,
        onData: (chunk: string) => void,
        onError: (chunk: string) => void,
        onEnd: (code: number | null) => void
    ) {
        let commandToRun = this.pythonPath || "python3";
        // If the path contains spaces and isn't quoted, quote it to prevent shell errors
        const cmd = commandToRun.includes(" ") && !commandToRun.startsWith('"') ? `"${commandToRun}"` : commandToRun;
        
        // Escape the JSON to pass it as a command line argument safely
        const inputObj = {
            prompt: prompt,
            model: model,
            sessionId: sessionId
        };
        // Use base64 encoding to completely avoid shell escaping nightmares across Windows/Mac
        const base64Input = Buffer.from(JSON.stringify(inputObj)).toString('base64');
        
        const fullCommand = `${cmd} "${this.wrapperPath}" "${base64Input}"`;
        console.log(`[CopilotService] Executing in ${this.vaultPath}: ${fullCommand}`);

        exec(fullCommand, { cwd: this.vaultPath, maxBuffer: 1024 * 1024 * 10 }, (error: any, stdout: string, stderr: string) => {
            if (stderr) {
                console.debug(`[CopilotService STDERR]: ${stderr}`);
                // Only treat it as an actual error if exec itself failed, 
                // because python might print warnings to stderr.
            }
            
            if (error) {
                console.error(`[CopilotService] Exec Error:`, error);
                onError(`[Failed to execute Python Wrapper]: ${error.message}\nStderr: ${stderr}`);
                onEnd(error.code !== undefined ? error.code : -1);
                return;
            }

            console.log(`[CopilotService STDOUT length]: ${stdout.length}`);
            onData(stdout);
            onEnd(0);
        });
        
        // Return dummy object to match signature for now, since ChatView doesn't actually call methods on it
        return {} as ChildProcessWithoutNullStreams;
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
