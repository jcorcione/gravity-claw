import { config } from "./config.js";
import OpenAI from "openai";
import { InputFile } from "grammy";

// ─── State ───────────────────────────────────────────────

let voiceRepliesEnabled = false;

export function isVoiceReplyEnabled(): boolean {
    return voiceRepliesEnabled && canSynthesize();
}

export function toggleVoiceReplies(): boolean {
    voiceRepliesEnabled = !voiceRepliesEnabled;
    return voiceRepliesEnabled;
}

// ─── Capabilities ────────────────────────────────────────

export function canTranscribe(): boolean {
    return config.groqApiKey !== null;
}

export function canSynthesize(): boolean {
    return config.elevenLabsApiKey !== null;
}

// ─── Groq Whisper Client ─────────────────────────────────

let groqClient: OpenAI | null = null;

function getGroqClient(): OpenAI {
    if (!groqClient) {
        if (!config.groqApiKey) {
            throw new Error("GROQ_API_KEY not configured");
        }
        groqClient = new OpenAI({
            baseURL: "https://api.groq.com/openai/v1",
            apiKey: config.groqApiKey,
        });
    }
    return groqClient;
}

// ─── Transcribe (STT) ────────────────────────────────────

export async function transcribe(
    audioBuffer: Buffer,
    filename: string = "voice.ogg"
): Promise<string> {
    const client = getGroqClient();

    // Create a File object from the buffer
    const file = new File([new Uint8Array(audioBuffer)], filename, {
        type: "audio/ogg",
    });

    const response = await client.audio.transcriptions.create({
        model: "whisper-large-v3",
        file: file,
        language: "en",
    });

    return response.text;
}

// ─── Synthesize (TTS) ────────────────────────────────────

export async function synthesize(text: string): Promise<InputFile> {
    if (!config.elevenLabsApiKey) {
        throw new Error("ELEVENLABS_API_KEY not configured");
    }

    // Truncate very long text (ElevenLabs has limits)
    const truncated = text.length > 5000 ? text.substring(0, 5000) + "..." : text;

    const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenLabsVoiceId}`,
        {
            method: "POST",
            headers: {
                "xi-api-key": config.elevenLabsApiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                text: truncated,
                model_id: "eleven_turbo_v2_5",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                },
            }),
        }
    );

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`ElevenLabs API error (${response.status}): ${err}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new InputFile(buffer, "response.mp3");
}
