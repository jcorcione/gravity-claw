import { readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { Tool } from "./index.js";

export const listDirectoryTool: Tool = {
    name: "list_directory",
    description:
        "List files and subdirectories in a directory. Returns names, types (file/directory), and sizes. Use for exploring project structure, finding files, etc.",
    inputSchema: {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "Directory path (relative to project root or absolute). Defaults to '.' (current directory).",
            },
        },
        required: [],
    },
    execute: async (input) => {
        const dirPath = resolve((input.path as string) || ".");

        try {
            const entries = await readdir(dirPath, { withFileTypes: true });

            const items = await Promise.all(
                entries
                    .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
                    .map(async (entry) => {
                        const fullPath = join(dirPath, entry.name);
                        const isDir = entry.isDirectory();

                        let size: number | undefined;
                        if (!isDir) {
                            try {
                                const s = await stat(fullPath);
                                size = s.size;
                            } catch { /* ignore */ }
                        }

                        return {
                            name: entry.name,
                            type: isDir ? "directory" : "file",
                            size,
                        };
                    })
            );

            // Sort: directories first, then files
            items.sort((a, b) => {
                if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

            return JSON.stringify({
                path: dirPath,
                count: items.length,
                items,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return JSON.stringify({ error: message, path: dirPath });
        }
    },
};
