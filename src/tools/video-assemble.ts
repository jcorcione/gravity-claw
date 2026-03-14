import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Tool } from "./index.js";

// (The Flask compiler now handles downloading URLs directly)

const COMFYUI_OUTPUT = "C:/ComfyUI/ComfyUI_windows_portable/ComfyUI/output";

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
            dynamic_subtitles: {
                type: "boolean",
                description: "Enable dynamic word-by-word subtitles via Groq Whisper API (default: false)"
            }
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

        // Handle base64-encoded audio: "base64:filename.mp3:BASE64DATA"
        // This is used when the audio is generated on Railway and sent to the local compiler.
        if (audioPath.startsWith("base64:")) {
            const parts = audioPath.split(":");
            const audioFilename = parts[1]; // e.g. gravity-claw-voiceover-12345.mp3
            const audioData = parts.slice(2).join(":"); // rest is base64
            const localAudioPath = path.join(COMFYUI_OUTPUT, audioFilename);
            try {
                fs.writeFileSync(localAudioPath, Buffer.from(audioData, "base64"));
                audioPath = localAudioPath;
                console.log(`[video_assemble] Wrote base64 audio to local file: ${localAudioPath}`);
            } catch (e: any) {
                return `Error: Could not write audio to local disk: ${e.message}`;
            }
        }

        // Extract filename from ComfyUI tailscale URL if it is one, to avoid local loopback network errors
        if (imagePath.includes("view?filename=")) {
            const urlObj = new URL(imagePath);
            const filename = urlObj.searchParams.get("filename");
            if (filename) {
                imagePath = filename;
            }
        }

        if (!imagePath.startsWith("http") && !imagePath.includes("/") && !imagePath.includes("\\")) {
            imagePath = `${COMFYUI_OUTPUT}/${imagePath}`;
        }
        if (!audioPath.startsWith("http") && !audioPath.includes("/") && !audioPath.includes("\\")) {
            // Audio paths from elevenlabs_audio might already be absolute. If not, default to COMFYUI_OUTPUT
            audioPath = `${COMFYUI_OUTPUT}/${audioPath}`;
        }

        const outputName = (input.outputName as string | undefined) ?? `short_${Date.now()}.mp4`;
        const subtitle = input.subtitle as string | undefined;
        const effect = (input.effect as string | undefined) ?? "static";
        const dynamicSubtitles = (input.dynamic_subtitles as boolean | undefined) ?? false;
        const groqApiKey = process.env["GROQ_API_KEY"];
        const bgMusicDir = "C:/Users/jcorc/n8n/assets/music/worship";

        // Health check
        try {
            const healthRes = await fetch(`${compilerUrl}/health`, { signal: AbortSignal.timeout(5000) });
            if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.status}`);
        } catch (err: any) {
            return `Error: Cannot reach the video compiler at ${compilerUrl}.\nMake sure the Flask server is running: python grace_note_compiler_fixed.py\nDetails: ${err.message}`;
        }

        console.log(`  🎬 Assembling Short: ${imagePath} + ${audioPath} → ${outputName}`);

        try {
            const payload = {
                image_path: imagePath,
                audio_path: audioPath,
                output_name: outputName,
                subtitle,
                effect,
                dynamic_subtitles: dynamicSubtitles,
                groq_api_key: groqApiKey,
                bg_music_dir: bgMusicDir
            };

            const res = await fetch(`${compilerUrl}/assemble`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(300_000), // 5 min
            });

            const data = await res.json() as any;

            if (data.status === "success") {
                // Best practice: clean up raw source assets now that they are safely baked into the final MP4
                try {
                    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
                    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
                } catch (e: any) {
                    console.log(`[video_assemble] Warning: Could not delete source assets: ${e.message}`);
                }

                return `✅ Short assembled!\n📁 Output: ${data.output_file}\n⏱️ Duration: ${data.duration_seconds?.toFixed(1) ?? "unknown"}s\n📐 Format: 1080×1920 (9:16 Shorts)\n\nNext steps:\n1. r2_upload(filePath="${data.output_file}") → get public URL\n2. youtube_upload(videoUrl="[R2 URL]", title="...", channel="grace_note")`;
            } else {
                return `❌ Assembly failed: ${data.message ?? data.error ?? JSON.stringify(data)}`;
            }
        } catch (err: any) {
            return `Error calling assembly endpoint: ${err.message}`;
        }
    },
};
