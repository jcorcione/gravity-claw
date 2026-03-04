import fetch from "node-fetch";
import type { Tool } from "./index.js";

export const videoCompileTool: Tool = {
    name: "video_compile",
    description: `Compile/stitch one or more video clips or YouTube URLs into a final MP4 using the local FFmpeg compiler server on John's desktop PC.
This is the final step in the video production pipeline — after scripts, thumbnails, and audio are generated, this tool assembles them into a deliverable.

Requires the local Flask compiler to be running (python grace_note_compiler_fixed.py) and exposed via Tailscale.

Modes:
- urls: Pass an array of YouTube URLs to download and stitch together into a compilation
- files: Pass an array of local file paths (on the desktop) to stitch together

The output MP4 is saved to the desktop's comfyui-output folder.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            urls: {
                type: "array",
                items: { type: "string" },
                description: "Array of YouTube URLs to download and compile into one video",
            },
            files: {
                type: "array",
                items: { type: "string" },
                description: "Array of local file paths on the desktop to stitch together",
            },
            outputName: {
                type: "string",
                description: "Name for the output file (default: compilation.mp4)",
            },
        },
    },
    execute: async (input) => {
        const compilerUrl = process.env["COMPILER_URL"];
        if (!compilerUrl) {
            return "Error: COMPILER_URL is not set. Start the Flask compiler on your desktop (python grace_note_compiler_fixed.py) and expose port 5055 via Tailscale, then set COMPILER_URL in Railway env vars.";
        }

        const urls = (input.urls as string[]) || [];
        const files = (input.files as string[]) || [];
        const outputName = (input.outputName as string) || "compilation.mp4";

        if (urls.length === 0 && files.length === 0) {
            return "Error: Provide at least one URL or file path to compile.";
        }

        // First check health
        try {
            const healthRes = await fetch(`${compilerUrl}/health`, { signal: AbortSignal.timeout(5000) });
            if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.status}`);
        } catch (err: any) {
            return `Error: Cannot reach the video compiler at ${compilerUrl}. Make sure the desktop Flask server is running and Tailscale is active.\nDetails: ${err.message}`;
        }

        try {
            console.log(`  🎬 Calling video compiler: ${urls.length} URLs, ${files.length} files → ${outputName}`);
            const res = await fetch(`${compilerUrl}/process`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ urls, files, outputName }),
                signal: AbortSignal.timeout(600_000), // 10 min timeout for large files
            });

            const data = await res.json() as any;

            if (data.status === "success") {
                return `✅ Video compilation complete!\n📁 Output: ${data.output_file}\n🎬 Videos processed: ${data.videos_processed}/${data.videos_requested}\n${data.message}`;
            } else {
                return `❌ Compilation failed: ${data.message}`;
            }
        } catch (err: any) {
            return `Error calling video compiler: ${err.message}`;
        }
    },
};
