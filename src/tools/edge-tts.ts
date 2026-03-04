import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { Tool } from "./index.js";

// Voice options for Edge TTS (free, no API key needed)
const VOICES: Record<string, string> = {
    // Grace Note voices — warm, spiritual
    "erika": "en-US-AriaNeural",        // Warm, expressive female
    "grace": "en-US-JennyNeural",       // Clear, friendly female
    // Gigawerx voices — confident, professional
    "john": "en-US-GuyNeural",         // Confident male
    "david": "en-US-DavisNeural",       // Deep male voice
    // Defaults
    "female": "en-US-AriaNeural",
    "male": "en-US-GuyNeural",
};

const DEFAULT_OUTPUT_DIR = process.env["COMFYUI_OUTPUT_PATH"] ?? "C:/Users/jcorc/comfyui-output";

export const edgeTtsTool: Tool = {
    name: "edge_tts",
    description: `Generate free voiceover audio using Microsoft Edge TTS (no API key required).
Use as a fallback when ElevenLabs quota is exhausted, or for quick drafts.

Available voices:
- "erika" / "grace" / "female" → Warm female voices (good for Grace Note)
- "john" / "david" / "male" → Confident male voices (good for Gigawerx)

Output is saved as an MP3 file to the comfyui-output directory.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            text: {
                type: "string",
                description: "The script text to convert to speech",
            },
            voice: {
                type: "string",
                description: "Voice to use: erika, grace, female, john, david, male (default: female)",
            },
            outputFile: {
                type: "string",
                description: "Output filename (default: tts_output.mp3)",
            },
            rate: {
                type: "string",
                description: "Speaking rate adjustment, e.g. '+10%' or '-5%' (default: '+0%')",
            },
        },
        required: ["text"],
    },
    execute: async (input) => {
        const text = input.text as string;
        const voiceKey = ((input.voice as string) || "female").toLowerCase();
        const outputFile = (input.outputFile as string) || "tts_output.mp3";
        const rate = (input.rate as string) || "+0%";

        const voiceId = VOICES[voiceKey] ?? VOICES["female"];
        const outputPath = path.join(DEFAULT_OUTPUT_DIR, outputFile);

        // Ensure output dir exists
        try {
            fs.mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
        } catch { /* already exists */ }

        // Write text to temp file to avoid command-line escaping issues
        const tempTextFile = path.join(DEFAULT_OUTPUT_DIR, "_tts_input.txt");
        fs.writeFileSync(tempTextFile, text, "utf8");

        try {
            console.log(`  🎙️ Edge TTS: voice=${voiceId}, output=${outputPath}`);
            execSync(
                `npx edge-tts --voice "${voiceId}" --rate "${rate}" --file "${tempTextFile}" --write-media "${outputPath}"`,
                { timeout: 60_000 }
            );

            // Cleanup temp file
            try { fs.unlinkSync(tempTextFile); } catch { /* ignore */ }

            if (fs.existsSync(outputPath)) {
                const sizeKb = Math.round(fs.statSync(outputPath).size / 1024);
                return `✅ TTS generated: ${outputPath}\n🎙️ Voice: ${voiceId}\n📁 Size: ${sizeKb} KB`;
            } else {
                return "Error: TTS command ran but output file was not created.";
            }
        } catch (err: any) {
            // Cleanup temp file on error
            try { fs.unlinkSync(tempTextFile); } catch { /* ignore */ }
            return `Error generating TTS: ${err.message ?? err}`;
        }
    },
};
