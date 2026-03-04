import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Tool } from "./index.js";

// Download a URL to a temp file, return local path
async function downloadToTemp(url: string, ext: string): Promise<string> {
    const tmpPath = path.join(os.tmpdir(), `gc_asset_${Date.now()}.${ext}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Failed to download asset from URL: HTTP ${res.status} — ${url}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(tmpPath, Buffer.from(buffer));
    console.log(`  ⬇️ Downloaded asset to temp: ${tmpPath}`);
    return tmpPath;
}

const COMFYUI_OUTPUT = "C:/Users/jcorc/comfyui-output";

export const videoAssembleTool: Tool = {
    name: "video_assemble",
    description: `Assemble a YouTube Short from an AI-generated image + voiceover audio using FFmpeg on John's desktop.

This is the Mode 2 "Full Creation" connector — the final step before R2 upload and YouTube publish.

Input:
- imagePath: local path to the thumbnail/image (PNG from ComfyUI, e.g. C:/Users/jcorc/comfyui-output/thumbnail.png)
- audioPath: local path to the voiceover MP3 (from ElevenLabs, e.g. C:/Users/jcorc/comfyui-output/voiceover.mp3)
- outputName: filename for the output MP4 (default: short_[timestamp].mp4)
- duration: optional max duration in seconds (default: uses audio length)
- addSubtitle: optional subtitle text to burn into the video

Output: local path to assembled MP4, ready for r2_upload → youtube_upload.

YouTube Shorts spec: 1080×1920 (9:16 vertical), H.264, AAC 192kbps, up to 60 seconds.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            imagePath: {
                type: "string",
                description: `Path to the thumbnail/image file on the desktop. Default search location: ${COMFYUI_OUTPUT}/`,
            },
            audioPath: {
                type: "string",
                description: `Path to the voiceover MP3 or WAV file on the desktop. Default search location: ${COMFYUI_OUTPUT}/`,
            },
            outputName: {
                type: "string",
                description: "Output filename (default: short_TIMESTAMP.mp4)",
            },
            subtitle: {
                type: "string",
                description: "Optional text to burn as a subtitle/title overlay on the video",
            },
            effect: {
                type: "string",
                enum: ["static", "zoom_in", "zoom_out", "fade"],
                description: "Visual effect for the image (default: static). 'zoom_in'/'zoom_out' add a slow Ken Burns zoom effect.",
            },
        },
        required: ["imagePath", "audioPath"],
    },
    execute: async (input) => {
        const compilerUrl = process.env["COMPILER_URL"];
        if (!compilerUrl) {
            return "Error: COMPILER_URL is not set. The Flask compiler must be running on the desktop.";
        }

        let imagePath = input.imagePath as string;
        let audioPath = input.audioPath as string;
        const outputName = (input.outputName as string | undefined)
            ?? `short_${Date.now()}.mp4`;
        const subtitle = input.subtitle as string | undefined;
        const effect = (input.effect as string | undefined) ?? "static";

        // Auto-download if URLs provided instead of local paths
        const tempFiles: string[] = [];
        try {
            if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
                console.log(`  🌐 Image is a URL — downloading to temp file...`);
                imagePath = await downloadToTemp(imagePath, "png");
                tempFiles.push(imagePath);
            }
            if (audioPath.startsWith("http://") || audioPath.startsWith("https://")) {
                console.log(`  🌐 Audio is a URL — downloading to temp file...`);
                audioPath = await downloadToTemp(audioPath, "mp3");
                tempFiles.push(audioPath);
            }
        } catch (err: any) {
            return `Error downloading asset: ${err.message}`;
        }

        // Health check
        try {
            const healthRes = await fetch(`${compilerUrl}/health`, { signal: AbortSignal.timeout(5000) });
            if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.status}`);
        } catch (err: any) {
            return `Error: Cannot reach the video compiler at ${compilerUrl}.\nMake sure the Flask server is running: python grace_note_compiler_fixed.py\nDetails: ${err.message}`;
        }

        console.log(`  🎬 Assembling Short: ${imagePath} + ${audioPath} → ${outputName}`);

        try {
            const res = await fetch(`${compilerUrl}/assemble`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_path: imagePath, audio_path: audioPath, output_name: outputName, subtitle, effect }),
                signal: AbortSignal.timeout(120_000), // 2 min
            });

            const data = await res.json() as any;

            if (data.status === "success") {
                return `✅ Short assembled!\n📁 Output: ${data.output_file}\n⏱️ Duration: ${data.duration_seconds?.toFixed(1) ?? "unknown"}s\n📐 Format: 1080×1920 (9:16 Shorts)\n\nNext steps:\n1. r2_upload(filePath="${data.output_file}") → get public URL\n2. youtube_upload(videoUrl="[R2 URL]", title="...", channel="grace_note")`;
            } else {
                return `❌ Assembly failed: ${data.message ?? data.error ?? JSON.stringify(data)}`;
            }
        } catch (err: any) {
            return `Error calling assembly endpoint: ${err.message}`;
        }
    },
};
