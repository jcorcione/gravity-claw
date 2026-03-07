import { VercelRequest, VercelResponse } from "@vercel/node";
import { runAgentLoop } from "../src/agent.js";
import { initMemory } from "../src/memory-pg.js";
import { initPinecone } from "../src/pinecone.js";
import { initMcpServers, getMcpTools } from "../src/mcp.js";
import { Bot } from "grammy";

// Global initialization flag
let isInitialized = false;
let bot: Bot | null = null;

async function ensureInitialized() {
    if (isInitialized) return;

    console.log("[INIT] Step 1: Starting initialization...");
    await initMemory();
    console.log("[INIT] Step 2: Memory initialized");

    try { await initPinecone(); } catch (e) { console.warn("[INIT] Pinecone failed (non-fatal):", e); }
    console.log("[INIT] Step 3: Pinecone done");

    try { await initMcpServers(); } catch (e) { console.warn("[INIT] MCP failed (non-fatal):", e); }
    console.log("[INIT] Step 4: MCP done");

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing at runtime!");

    console.log("[INIT] Step 5: Creating bot instance...");
    bot = new Bot(token);

    bot.command("start", async (ctx) => {
        await ctx.reply("System Online. Awaiting input.");
    });

    bot.command("help", async (ctx) => {
        const helpText = `*🤖 AgenticHQ Commands*

/start - Check if system is online
/status - View system resources and API balances
/scan - Run the Gmail recruiter scanner immediately
/help - Show this message

_You can also just talk to me normally! If you ask me to search your emails or manage your inbox, I will use my AI tools automatically._`;
        await ctx.reply(helpText, { parse_mode: "Markdown" });
    });

    bot.command("status", async (ctx) => {
        const userId = ctx.from?.id;
        const allowedIds = (process.env.ALLOWED_USER_IDS || "").split(",").map(Number);
        if (!userId || !allowedIds.includes(userId)) {
            await ctx.reply("Unauthorized access sequence detected. Protocol denied.");
            return;
        }

        await ctx.replyWithChatAction("typing");
        let reply = `📊 *System Status*\n\n`;

        try {
            const { getGlobalStats } = await import("../src/memory-pg.js");
            const { getPineconeStats } = await import("../src/pinecone.js");

            const { userCount, dbByteSize } = await getGlobalStats();
            const pineconeRecords = await getPineconeStats();

            reply += `👥 *Total Users:*  ${userCount}\n`;
            reply += `💾 *Supabase DB:*  ${(dbByteSize / 1024 / 1024).toFixed(2)} MB\n`;
            reply += `🌲 *Pinecone Vectors:*  ${pineconeRecords}\n\n`;
        } catch (e: any) {
            reply += `⚠️ DB Checks failed: ${e.message}\n\n`;
        }

        try {
            const orKey = process.env.OPENROUTER_API_KEY;
            if (orKey) {
                const res = await fetch("https://openrouter.ai/api/v1/credits", {
                    headers: { "Authorization": `Bearer ${orKey}` }
                });

                // OpenRouter has a /credits endpoint and an /auth/key endpoint
                // Let's fallback to /auth/key if credits fails or is restructured
                const authRes = await fetch("https://openrouter.ai/api/v1/auth/key", {
                    headers: { "Authorization": `Bearer ${orKey}` }
                });

                const data = await authRes.json();
                if (data && data.data) {
                    const usage = data.data.usage || 0;
                    const limit = data.data.limit;

                    if (limit) {
                        reply += `💳 *OpenRouter:*  $${usage.toFixed(4)} / $${limit.toFixed(2)}`;
                    } else {
                        reply += `💳 *OpenRouter Usage:*  $${usage.toFixed(4)}`;
                    }
                }
            }
        } catch (e: any) {
            reply += `💳 OpenRouter check failed.`;
        }

        await ctx.reply(reply, { parse_mode: "Markdown" });
    });


    bot.command("scan", async (ctx) => {
        await ctx.reply("📬 Running email scan now...");
        try {
            await initMcpServers();
            const tools = getMcpTools();
            const scanTool = tools.find(t => t.name === "scan_recruiter_emails");
            if (!scanTool) throw new Error("Scanner tool not available");
            const reply = await scanTool.execute({ maxEmails: 50 });
            await ctx.reply(reply, { parse_mode: "Markdown" });
        } catch (e: any) {
            await ctx.reply(`❌ Scan failed: ${e.message}`);
        }
    });

    bot.on("message:text", async (ctx) => {
        const userId = ctx.from?.id;
        const allowedIds = (process.env.ALLOWED_USER_IDS || "").split(",").map(Number);
        if (!userId || !allowedIds.includes(userId)) {
            await ctx.reply("Unauthorized access sequence detected. Protocol denied.");
            return;
        }

        try {
            await ctx.replyWithChatAction("typing");
            const response = await runAgentLoop(ctx.message.text, userId.toString());

            const charLimit = 4000;
            for (let i = 0; i < response.length; i += charLimit) {
                await ctx.reply(response.slice(i, i + charLimit), { parse_mode: "Markdown" });
            }
        } catch (error: any) {
            console.error("Agent Error:", error);
            await ctx.reply(`System Error: ${error.message || error}`);
        }
    });

    bot.on("message:voice", async (ctx) => {
        const userId = ctx.from?.id;
        const allowedIds = (process.env.ALLOWED_USER_IDS || "").split(",").map(Number);
        if (!userId || !allowedIds.includes(userId)) {
            await ctx.reply("Unauthorized access sequence detected. Protocol denied.");
            return;
        }

        try {
            await ctx.replyWithChatAction("record_voice");
            await ctx.reply("🎙️ _Processing voice memo..._", { parse_mode: "Markdown" });

            // 1. Get the file from Telegram
            const voiceFileId = ctx.message.voice.file_id;
            const file = await ctx.api.getFile(voiceFileId);
            const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

            // 2. Download the actual audio data
            const audioResponse = await fetch(fileUrl);
            if (!audioResponse.ok) throw new Error("Failed to download voice note from Telegram");
            const audioBlob = await audioResponse.blob();

            // 3. Transcribe using Groq Whisper
            const formData = new FormData();
            formData.append("file", audioBlob, "voice.ogg");
            formData.append("model", "whisper-large-v3");

            const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
                },
                body: formData
            });

            if (!groqRes.ok) throw new Error("Audio transcription failed via Groq");
            const groqData = await groqRes.json();
            const transcribedText = groqData.text;

            await ctx.reply(`🗣️ *Transcription:* "${transcribedText}"\n_Thinking..._`, { parse_mode: "Markdown" });

            // 4. Pass to standard agent loop
            await ctx.replyWithChatAction("typing");
            const response = await runAgentLoop(transcribedText, userId.toString());

            const charLimit = 4000;
            for (let i = 0; i < response.length; i += charLimit) {
                await ctx.reply(response.slice(i, i + charLimit), { parse_mode: "Markdown" });
            }

        } catch (error: any) {
            console.error("Voice Processing Error:", error);
            await ctx.reply(`❌ Voice Processing Error: ${error.message || error}`);
        }
    });

    isInitialized = true;
    console.log("[INIT] Step 5b: Calling bot.init() to fetch bot info from Telegram...");
    await bot!.init();
    console.log("[INIT] Complete!");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        console.log("[HANDLER] Received POST, ensuring initialized...");
        await ensureInitialized();
        console.log("[HANDLER] Passing update to Grammy bot...");
        await bot!.handleUpdate(req.body);
        console.log("[HANDLER] Success!");
        return res.status(200).json({ ok: true });
    } catch (error: any) {
        console.error("[HANDLER] Fatal Error:", error?.message || error, error?.stack);
        return res.status(500).json({ error: "Internal Server Error", detail: error?.message });
    }
}
