import { config } from "./config.js";
import { bot } from "./bot.js";
import { getActiveModel } from "./models.js";
import { getMemoryCount, getScheduleCount, initMemory, closeDatabase } from "./memory-pg.js";
import { canTranscribe, canSynthesize } from "./voice.js";
import { initMcpServers, disconnectAll, getMcpTools } from "./mcp.js";
import { initHeartbeat, stopAllJobs } from "./heartbeat.js";
import { initPinecone } from "./pinecone.js";
import { startDiscordBot, stopDiscordBot } from "./discord.js";

// ─── Banner ──────────────────────────────────────────────

console.log(`
  ╔═══════════════════════════════════════╗
  ║          🤖 AgenticHQ             ║
  ║     Personal AI Agent — Level 7      ║
  ╚═══════════════════════════════════════╝
`);

// ─── Security Info ───────────────────────────────────────

const startupModel = getActiveModel();
console.log(`\n🔒 Security:`);
console.log(`  Allowed users: [${config.allowedUserIds.join(", ")}]`);
console.log(`  Transport: Telegram long-polling (no HTTP server)`);
console.log(`  Model: ${startupModel.alias} (${startupModel.modelId})`);

// ─── Memory Info ─────────────────────────────────────────

const memCount = await getMemoryCount();
console.log(`\n🧠 Memory:`);
console.log(`  Database: Supabase Postgres`);
console.log(`  Stored memories: ${memCount}`);

// ─── Voice Info ──────────────────────────────────────────

console.log(`\n🎤 Voice:`);
console.log(`  Transcription (Groq Whisper): ${canTranscribe() ? "✅ ready" : "⬚ no GROQ_API_KEY"}`);
console.log(`  Synthesis (ElevenLabs): ${canSynthesize() ? "✅ ready" : "⬚ no ELEVENLABS_API_KEY"}`);

// ─── MCP Servers ─────────────────────────────────────────

console.log(`\n🔌 MCP:`);
await initMcpServers();
const mcpToolCount = getMcpTools().length;
console.log(`  MCP tools available: ${mcpToolCount}`);

// ─── Pinecone Vector DB ──────────────────────────────────

await initPinecone();

// ─── Heartbeat ───────────────────────────────────────────

console.log(`\n⏰ Heartbeat:`);
await initHeartbeat(bot);
const schedCount = await getScheduleCount();
console.log(`  Custom schedules in DB: ${schedCount}`);

// ─── Start Bot ───────────────────────────────────────────

console.log(`\n🚀 Starting Telegram bot...`);

bot.start({
    onStart: (botInfo) => {
        console.log(`✅ Bot is live as @${botInfo.username}`);
        console.log(`   Send a message in Telegram to get started.\n`);
    },
});

console.log(`\n🚀 Starting Discord bot...`);
await startDiscordBot();

// ─── Graceful Shutdown ───────────────────────────────────

const shutdown = async () => {
    console.log("\n👋 Shutting down AgenticHQ...");
    bot.stop();
    await stopDiscordBot();
    stopAllJobs();
    await disconnectAll();
    await closeDatabase();
    process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
