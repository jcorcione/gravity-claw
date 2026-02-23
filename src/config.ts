import "dotenv/config";

interface Config {
    /** Telegram bot token from @BotFather */
    telegramBotToken: string;
    /** Cron schedule for heartbeat check-ins */
    heartbeatCheckinCron: string;

    /** OpenRouter API key */
    openRouterApiKey: string;
    /** Telegram user IDs allowed to use this bot */
    allowedUserIds: number[];
    /** LLM model identifier (OpenRouter format) */
    llmModel: string;
    /** Max tokens per LLM response */
    llmMaxTokens: number;
    /** Max agent loop iterations before force-stop */
    maxAgentIterations: number;
    /** Groq API key for Whisper transcription (optional) */
    groqApiKey: string | null;
    /** ElevenLabs API key for TTS (optional) */
    elevenLabsApiKey: string | null;
    /** ElevenLabs voice ID (optional) */
    elevenLabsVoiceId: string;
    /** Pinecone API KEY for vector memory */
    pineconeApiKey: string;
    /** OpenAI API KEY for embeddings */
    openAiApiKey: string;

    /** Supabase database URL for serverless memory */
    supabaseDbUrl: string;
}

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        // On Vercel, env vars may not be present at module-load time on cold starts.
        // Rather than crashing the serverless function, warn and return an empty string.
        // The individual handler functions will re-read the actual values at request time.
        const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
        if (isServerless) {
            console.warn(`⚠️ Missing env var at load time: ${name} (will be retried at request time)`);
            return "";
        }
        console.error(`❌ Missing required environment variable: ${name}`);
        console.error(`   Copy .env.example to .env and fill in all required values.`);
        process.exit(1);
    }
    return value;
}

function parseUserIds(raw: string): number[] {
    const ids = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);

    if (ids.some(isNaN)) {
        console.error("❌ ALLOWED_USER_IDS must be comma-separated numbers");
        process.exit(1);
    }

    if (ids.length === 0) {
        console.error("❌ ALLOWED_USER_IDS must contain at least one user ID");
        process.exit(1);
    }

    return ids;
}

export const config: Readonly<Config> = Object.freeze({
    telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
    heartbeatCheckinCron: process.env.HEARTBEAT_CHECKIN_CRON || "0 0 * * *", // Daily at midnight UTC
    openRouterApiKey: requireEnv("OPENROUTER_API_KEY"),
    allowedUserIds: parseUserIds(requireEnv("ALLOWED_USER_IDS")),
    llmModel: process.env["LLM_MODEL"] ?? "anthropic/claude-sonnet-4",
    llmMaxTokens: Number(process.env["LLM_MAX_TOKENS"] ?? "4096"),
    maxAgentIterations: Number(process.env["MAX_AGENT_ITERATIONS"] ?? "10"),
    groqApiKey: process.env["GROQ_API_KEY"] ?? null,
    elevenLabsApiKey: process.env["ELEVENLABS_API_KEY"] ?? null,
    elevenLabsVoiceId: process.env["ELEVENLABS_VOICE_ID"] ?? "JBFqnCBsd6RMkjVDRZzb",
    pineconeApiKey: process.env.PINECONE_API_KEY || "",
    openAiApiKey: process.env.OPENAI_API_KEY || "",
    supabaseDbUrl: process.env.SUPABASE_DB_URL || "",
});
