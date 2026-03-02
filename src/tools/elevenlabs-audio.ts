import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import os from "os";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

// Channel-specific voice defaults
const CHANNEL_VOICES: Record<string, { id: string; name: string }> = {
    gracenote: { id: "wIQlXk1pwcszdjmUYKyP", name: "Erika New Worship Voice" },
    gigawerx: { id: "2EsgRiyQL1INfP0QD8HP", name: "John's Voice Pro" },
    john_pro: { id: "2EsgRiyQL1INfP0QD8HP", name: "John's Voice Pro" },
    john_remix: { id: "DlY8s9SOfYLtqUczzSMQ", name: "John's Voice Pro - Remix" },
    john_1st: { id: "6F3SxDtOkYv75op5HViK", name: "John 1st Edition" },
    erika: { id: "wIQlXk1pwcszdjmUYKyP", name: "Erika New Worship Voice" },
    matilda: { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda" },
    nicole: { id: "piTKgcLEGmPE4e6mEKli", name: "Nicole" },
    mariana: { id: "OB0Jj6v9DGLLgz8dD57i", name: "Mariana" },
};

function getApiKey(): string {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("ELEVENLABS_API_KEY is not set.");
    return key;
}

// ─── Text-to-Speech ──────────────────────────────────────────────────────────
async function generateVoiceover(
    text: string,
    voiceId: string,
    outputPath: string
): Promise<void> {
    const key = getApiKey();
    const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
            "xi-api-key": key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
        },
        body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
                stability: 0.45,         // Slightly more expressive
                similarity_boost: 0.80,
                style: 0.30,             // Natural delivery
                use_speaker_boost: true
            }
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`ElevenLabs TTS error: ${err}`);
    }

    const buffer = await res.buffer();
    fs.writeFileSync(outputPath, buffer);
}

// ─── Music Generation ─────────────────────────────────────────────────────────
async function generateMusic(
    prompt: string,
    durationSeconds: number,
    outputPath: string
): Promise<void> {
    const key = getApiKey();
    const res = await fetch(`${ELEVENLABS_BASE}/text-to-sound-effects`, {
        method: "POST",
        headers: {
            "xi-api-key": key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
        },
        body: JSON.stringify({
            text: prompt,
            duration_seconds: durationSeconds,
            prompt_influence: 0.5
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`ElevenLabs music/SFX error: ${err}`);
    }

    const buffer = await res.buffer();
    fs.writeFileSync(outputPath, buffer);
}

export const elevenlabsAudioTool = {
    name: "elevenlabs_audio",
    description: `Generates audio for YouTube Shorts using ElevenLabs AI.
    Supports three modes:
    - 'voiceover': Converts a script to speech using channel-specific voices (Erika for Grace Note, John's Voice Pro for Gigawerx)
    - 'music': Generates original background music from a text prompt (15–60 seconds)
    - 'sfx': Generates sound effects (whooshes, ambient sounds, transitions)
    Output files are saved locally and the file path is returned.
    Available voices: gracenote (Erika), gigawerx (John Pro), john_remix, john_1st, matilda, nicole, mariana`,
    inputSchema: {
        type: "object",
        properties: {
            mode: {
                type: "string",
                enum: ["voiceover", "music", "sfx"],
                description: "What to generate: 'voiceover' = narrate script text, 'music' = background music, 'sfx' = sound effect"
            },
            text: {
                type: "string",
                description: "For voiceover: the script text to narrate. For music/sfx: a description of what to generate. Example music: 'uplifting gospel piano with soft strings, peaceful and hopeful, 30 seconds'. Example sfx: 'soft whoosh transition sound'"
            },
            channel: {
                type: "string",
                enum: ["gracenote", "gigawerx", "john_pro", "john_remix", "john_1st", "erika", "matilda", "nicole", "mariana"],
                description: "For voiceover: which voice to use. 'gracenote' auto-selects Erika, 'gigawerx' auto-selects John's Voice Pro. Default: 'gigawerx'"
            },
            duration_seconds: {
                type: "number",
                description: "For music/sfx only: duration in seconds (5–60). Default: 30"
            },
            filename: {
                type: "string",
                description: "Optional custom output filename (without extension). Default: auto-generated with timestamp."
            }
        },
        required: ["mode", "text"]
    },
    execute: async (input: Record<string, unknown>) => {
        const mode = String(input.mode || "voiceover");
        const text = String(input.text || "");
        const channel = String(input.channel || "gigawerx");
        const duration = Number(input.duration_seconds || 30);
        const customFilename = input.filename ? String(input.filename) : null;

        console.log(`[Tool: elevenlabs_audio] Mode: ${mode}, Channel: ${channel}`);

        // Output to ComfyUI output folder so it's accessible via Tailscale
        const outputDir = "C:\\ComfyUI\\ComfyUI_windows_portable\\ComfyUI\\output";
        const timestamp = Date.now();
        const ext = "mp3";
        const filename = customFilename
            ? `${customFilename}.${ext}`
            : `gravity-claw-${mode}-${timestamp}.${ext}`;
        const outputPath = path.join(outputDir, filename);

        // Ensure output dir exists (fallback to temp)
        let finalOutputPath = outputPath;
        if (!fs.existsSync(outputDir)) {
            finalOutputPath = path.join(os.tmpdir(), filename);
            console.warn(`[elevenlabs_audio] Output dir not found, using temp: ${finalOutputPath}`);
        }

        try {
            if (mode === "voiceover") {
                const voice = CHANNEL_VOICES[channel] || CHANNEL_VOICES.gigawerx;
                await generateVoiceover(text, voice.id, finalOutputPath);
                return JSON.stringify({
                    success: true,
                    mode: "voiceover",
                    voice: voice.name,
                    voiceId: voice.id,
                    outputPath: finalOutputPath,
                    filename,
                    characterCount: text.length,
                    instructions: "Audio file saved locally. Import into CapCut or your video editor as the voiceover track."
                }, null, 2);

            } else if (mode === "music" || mode === "sfx") {
                await generateMusic(text, Math.min(Math.max(duration, 5), 60), finalOutputPath);
                return JSON.stringify({
                    success: true,
                    mode,
                    prompt: text,
                    durationRequested: duration,
                    outputPath: finalOutputPath,
                    filename,
                    instructions: `${mode === "music" ? "Background music" : "Sound effect"} saved locally. Mix at 20-30% volume under your voiceover in CapCut.`
                }, null, 2);
            } else {
                return JSON.stringify({ error: `Unknown mode: ${mode}` });
            }
        } catch (err: any) {
            return JSON.stringify({ error: err.message, mode, channel });
        }
    }
};
