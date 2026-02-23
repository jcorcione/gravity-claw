import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool } from "./index.js";

const execAsync = promisify(exec);

// ─── Safety Tiers ────────────────────────────────────────

const SAFE_COMMANDS = new Set([
    "ls", "dir", "pwd", "cd", "echo", "cat", "head", "tail", "wc",
    "whoami", "date", "hostname", "which", "where", "type",
    "find", "grep", "rg", "fd", "tree", "df", "du",
    "node", "npm", "npx", "git", "tsc", "tsx",
    "python", "python3", "pip", "pip3",
    "curl", "wget", "ping",
    "env", "printenv", "set",
]);

const BLOCKED_PATTERNS = [
    /rm\s+(-rf|-fr|--recursive)\s+[\/\\]/i,
    /rm\s+-rf\s+\*/i,
    /del\s+\/s/i,
    /format\s+[a-z]:/i,
    /mkfs/i,
    /dd\s+if=/i,
    /shutdown/i,
    /reboot/i,
    /halt/i,
    /init\s+0/i,
    /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,  // fork bomb
    />\s*\/dev\/sd/i,
    /chmod\s+777\s+\//i,
    /chown\s+.*\s+\//i,
    /sudo\s+rm/i,
    /powershell.*-enc/i,
];

function classifyCommand(command: string): "safe" | "warn" | "blocked" {
    // Check blocked patterns first
    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(command)) return "blocked";
    }

    // Extract the base command
    const baseCmd = command.trim().split(/\s+/)[0].toLowerCase()
        .replace(/^(\.\/|\.\\)/, "")
        .replace(/\.exe$/, "");

    if (SAFE_COMMANDS.has(baseCmd)) return "safe";
    return "warn";
}

// ─── Constants ───────────────────────────────────────────

const MAX_OUTPUT = 4096;      // 4KB output limit
const TIMEOUT_MS = 30_000;    // 30 second timeout

// ─── Tool ────────────────────────────────────────────────

export const runShellTool: Tool = {
    name: "run_shell",
    description:
        "Execute a shell command and return its output. Use for system tasks, checking versions, listing processes, git operations, etc. Dangerous commands (rm -rf /, format, shutdown) are blocked. Output is truncated to 4KB.",
    inputSchema: {
        type: "object" as const,
        properties: {
            command: {
                type: "string",
                description: "The shell command to execute.",
            },
            cwd: {
                type: "string",
                description: "Working directory (optional, defaults to project root).",
            },
        },
        required: ["command"],
    },
    execute: async (input) => {
        const command = input.command as string;
        const cwd = (input.cwd as string) || process.cwd();

        // Safety check
        const tier = classifyCommand(command);

        if (tier === "blocked") {
            console.log(`  🚫 BLOCKED command: ${command}`);
            return JSON.stringify({
                error: "Command blocked by safety policy.",
                command,
                reason: "This command is potentially destructive and has been blocked.",
            });
        }

        if (tier === "warn") {
            console.log(`  ⚠️ Running unvetted command: ${command}`);
        }

        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd,
                timeout: TIMEOUT_MS,
                maxBuffer: 1024 * 1024, // 1MB buffer
                shell: process.platform === "win32" ? "powershell.exe" : "/bin/bash",
            });

            const output = stdout.trim();
            const errors = stderr.trim();

            // Truncate if needed
            const truncatedOutput = output.length > MAX_OUTPUT
                ? output.substring(0, MAX_OUTPUT) + `\n... (truncated, ${output.length} total chars)`
                : output;

            return JSON.stringify({
                exitCode: 0,
                stdout: truncatedOutput || "(no output)",
                stderr: errors || undefined,
                tier,
            });
        } catch (err: unknown) {
            const error = err as { code?: number; killed?: boolean; stdout?: string; stderr?: string; message?: string };

            if (error.killed) {
                return JSON.stringify({
                    error: `Command timed out after ${TIMEOUT_MS / 1000}s`,
                    command,
                });
            }

            return JSON.stringify({
                exitCode: error.code ?? 1,
                stdout: error.stdout?.trim() || undefined,
                stderr: error.stderr?.trim() || error.message || "Unknown error",
            });
        }
    },
};
