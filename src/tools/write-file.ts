import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import type { Tool } from "./index.js";

export const writeFileTool: Tool = {
    name: "write_file",
    description:
        "Write content to a file. Creates the file if it doesn't exist. Creates parent directories if needed. Use for generating files, saving results, creating scripts, etc.",
    inputSchema: {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "Path to write to (relative to project root or absolute).",
            },
            content: {
                type: "string",
                description: "The content to write to the file.",
            },
        },
        required: ["path", "content"],
    },
    execute: async (input) => {
        const filePath = resolve(input.path as string);
        const content = input.content as string;

        try {
            // Create parent directories if needed
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, content, "utf-8");

            return JSON.stringify({
                written: true,
                path: filePath,
                bytes: Buffer.byteLength(content, "utf-8"),
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return JSON.stringify({ error: message, path: filePath });
        }
    },
};
