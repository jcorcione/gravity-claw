import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import os from "os";

const KOKORO_BASE = "http://localhost:8880/v1/audio/speech";

// Map our channel/voice names to Kokoro built-in voices.
// You can adjust these IDs based on the voices actually installed in the local Kokoro container.
const CHANNEL_VOICES: Record<string, { id: string; name: string }> = {
    gracenote: { id: "af_heart", name: "American Female Heart" },
    gigawerx: { id: "am_adam", name: "American Male Adam" },
    john_pro: { id: "am_adam", name: "American Male Adam" },
    erika: { id: "af_bella", name: "American Female Bella" }
};

async function generateVoiceover(
    text: string,
    voiceId: string,
    outputPath: string
): Promise<void> {
    const res = await fetch(KOKORO_BASE, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "audio/wav"
        },
        body: JSON.stringify({
            model: "kokoro",
            input: text,
            voice: voiceId,
            response_format: "wav",
            speed: 1.0
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Kokoro TTS error: ${err}`);
    }

    const buffer = await res.buffer();
    fs.writeFileSync(outputPath, buffer);
}

export const kokoroAudioTool = {
    name: "kokoro_audio",
    description: `Generates voiceovers for YouTube Shorts using a local Kokoro TTS container.
    This is a free, local alternative to ElevenLabs.
    Output files are saved locally as .wav and the absolute file path is returned.
    Available voices: gracenote, gigawerx, john_pro, erika`,
    inputSchema: {
        type: "object",
        properties: {
            text: {
                type: "string",
                description: "The script text to narrate."
            },
            channel: {
                type: "string",
                enum: ["gracenote", "gigawerx", "john_pro", "erika"],
                description: "Which voice to use. 'gracenote' uses a female voice, 'gigawerx' uses a male voice. Default: 'gigawerx'"
            },
            filename: {
                type: "string",
                description: "Optional custom output filename (without extension). Default: auto-generated with timestamp."
            }
        },
        required: ["text"]
    },
    execute: async (input: Record<string, unknown>) => {
        const text = String(input.text || "");
        const channel = String(input.channel || "gigawerx");
        const customFilename = input.filename ? String(input.filename) : null;

        console.log(`[Tool: kokoro_audio] Channel: ${channel}`);

        // Output to ComfyUI output folder so it's accessible via Tailscale
        const outputDir = "C:\\ComfyUI\\ComfyUI_windows_portable\\ComfyUI\\output";
        const timestamp = Date.now();
        const ext = "wav";
        const filename = customFilename
            ? `${customFilename}.${ext}`
            : `kokoro-voiceover-${timestamp}.${ext}`;

        let outputPath = path.join(outputDir, filename);

        // Ensure output dir exists (fallback to temp)
        if (!fs.existsSync(outputDir)) {
            outputPath = path.join(os.tmpdir(), filename);
            console.warn(`[kokoro_audio] Output dir not found, using temp: ${outputPath}`);
        }

        try {
            const voice = CHANNEL_VOICES[channel] || CHANNEL_VOICES.gigawerx;
            await generateVoiceover(text, voice.id, outputPath);
            return JSON.stringify({
                success: true,
                mode: "voiceover",
                voice: voice.name,
                voiceId: voice.id,
                outputPath: outputPath,
                filename,
                characterCount: text.length,
                instructions: "Audio file saved locally. Import into CapCut or your video editor as the voiceover track."
            }, null, 2);

        } catch (err: any) {
            return JSON.stringify({ error: err.message, channel });
        }
    }
};
