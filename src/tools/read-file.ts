import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Tool } from "./index.js";

const MAX_LINES = 200;
const MAX_CHARS = 8192;

export const readFileTool: Tool = {
    name: "read_file",
    description:
        "Read the contents of a file. Returns the text content, truncated if too large. Use for reading configuration, source code, logs, etc.",
    inputSchema: {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "Path to the file to read (relative to project root or absolute).",
            },
            max_lines: {
                type: "number",
                description: `Maximum lines to return (default: ${MAX_LINES}).`,
            },
        },
        required: ["path"],
    },
    execute: async (input) => {
        const filePath = resolve(input.path as string);
        const maxLines = (input.max_lines as number) || MAX_LINES;

        try {
            const content = await readFile(filePath, "utf-8");
            const lines = content.split("\n");
            const totalLines = lines.length;

            let result = lines.slice(0, maxLines).join("\n");

            if (result.length > MAX_CHARS) {
                result = result.substring(0, MAX_CHARS) + "\n... (truncated)";
            }

            return JSON.stringify({
                path: filePath,
                totalLines,
                shownLines: Math.min(maxLines, totalLines),
                truncated: totalLines > maxLines || content.length > MAX_CHARS,
                content: result,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return JSON.stringify({ error: message, path: filePath });
        }
    },
};
