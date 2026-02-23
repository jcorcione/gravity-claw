import { Bot } from "grammy";
import { config } from "./config.js";
import { runAgentLoop } from "./agent.js";
import {
    getActiveModel,
    setActiveModel,
    formatModelList,
    resetToDefaultModel,
} from "./models.js";
import {
    canTranscribe,
    canSynthesize,
    transcribe,
    synthesize,
    isVoiceReplyEnabled,
    toggleVoiceReplies,
} from "./voice.js";
import { formatMcpStatus } from "./mcp.js";
import {
    triggerBriefing,
    formatScheduleList,
    registerCustomSchedule,
    unregisterCustomSchedule,
} from "./heartbeat.js";
import { addSchedule, removeSchedule } from "./memory-pg.js";
import cron from "node-cron";

// ─── Create Bot ──────────────────────────────────────────

export const bot = new Bot(config.telegramBotToken);

// ─── Security: User ID Whitelist ─────────────────────────

bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !config.allowedUserIds.includes(userId)) {
        return;
    }
    await next();
});

// ─── /model Command ──────────────────────────────────────

bot.command("model", async (ctx) => {
    const args = ctx.match?.trim();

    if (!args) {
        const current = getActiveModel();
        const list = formatModelList();
        await ctx.reply(
            `🧠 *Active model:* ${current.alias}\n\`${current.modelId}\`\n\n*Available models:*\n${list}\n\n_Switch with:_ \`/model <alias>\``,
            { parse_mode: "Markdown" }
        );
        return;
    }

    const result = setActiveModel(args);
    if (!result) {
        await ctx.reply(
            `❌ Unknown model alias: "${args}"\n\nUse \`/model\` to see available models.`,
            { parse_mode: "Markdown" }
        );
        return;
    }

    console.log(`  🔄 Model switched to: ${result.alias} (${result.modelId})`);
    await ctx.reply(
        `✅ Switched to *${result.alias}*${result.free ? " 🆓" : ""}\n\`${result.modelId}\``,
        { parse_mode: "Markdown" }
    );
});

// ─── /voice Command ──────────────────────────────────────

bot.command("voice", async (ctx) => {
    if (!canSynthesize()) {
        await ctx.reply("🔇 Voice replies unavailable — ELEVENLABS_API_KEY not configured.");
        return;
    }

    const enabled = toggleVoiceReplies();
    await ctx.reply(
        enabled
            ? "🔊 Voice replies *enabled* — I'll reply with audio + text."
            : "🔇 Voice replies *disabled* — text only.",
        { parse_mode: "Markdown" }
    );
});

// ─── /mcp Command ────────────────────────────────────────

bot.command("mcp", async (ctx) => {
    const status = formatMcpStatus();
    await ctx.reply(`🔌 *MCP Servers*\n\n${status}`, { parse_mode: "Markdown" });
});

// ─── /briefing Command ───────────────────────────────────

bot.command("briefing", async (ctx) => {
    await ctx.reply("⏰ Running morning briefing now...");
    await ctx.replyWithChatAction("typing");

    try {
        const response = await triggerBriefing();
        await ctx.reply(response, { parse_mode: "Markdown" });
    } catch (err) {
        console.error("❌ Briefing error:", err);
        await ctx.reply("Something went wrong with the briefing.");
    } finally {
        resetToDefaultModel();
    }
});

// ─── /schedule Command ───────────────────────────────────

bot.command("schedule", async (ctx) => {
    const args = ctx.match?.trim() ?? "";

    // No args → list schedules
    if (!args) {
        const list = formatScheduleList();
        await ctx.reply(`⏰ *Active Schedules*\n\n${list}`, { parse_mode: "Markdown" });
        return;
    }

    // /schedule remove <id>
    if (args.startsWith("remove ")) {
        const id = parseInt(args.replace("remove ", "").trim());
        if (isNaN(id)) {
            await ctx.reply("Usage: `/schedule remove <id>`", { parse_mode: "Markdown" });
            return;
        }
        const removed = await removeSchedule(id);
        if (removed) {
            unregisterCustomSchedule(id);
            await ctx.reply(`✅ Schedule #${id} removed.`);
        } else {
            await ctx.reply(`❌ No schedule found with ID ${id}.`);
        }
        return;
    }

    // /schedule add "<cron>" <prompt>
    if (args.startsWith("add ")) {
        const rest = args.slice(4).trim();
        // Parse: "cron expression" prompt text
        const cronMatch = rest.match(/^["']([^"']+)["']\s+(.+)$/s);
        if (!cronMatch) {
            await ctx.reply(
                'Usage: `/schedule add "<cron>" <prompt>`\n\nExample: `/schedule add "0 9 * * 1" Remind me about weekly standup`',
                { parse_mode: "Markdown" }
            );
            return;
        }

        const cronExpr = cronMatch[1];
        const prompt = cronMatch[2];

        if (!cron.validate(cronExpr)) {
            await ctx.reply(`❌ Invalid cron expression: \`${cronExpr}\``, { parse_mode: "Markdown" });
            return;
        }

        const name = prompt.substring(0, 40);
        const schedule = await addSchedule(name, cronExpr, prompt);
        registerCustomSchedule(schedule);

        await ctx.reply(
            `✅ Schedule added (id:${schedule.id})\n⏰ \`${cronExpr}\`\n📝 ${prompt}`,
            { parse_mode: "Markdown" }
        );
        return;
    }

    await ctx.reply(
        'Usage:\n`/schedule` — list all\n`/schedule add "<cron>" <prompt>` — add new\n`/schedule remove <id>` — remove',
        { parse_mode: "Markdown" }
    );
});

// ─── Voice Message Handler ───────────────────────────────

bot.on(["message:voice", "message:audio"], async (ctx) => {
    const userName = ctx.from.first_name;

    if (!canTranscribe()) {
        await ctx.reply("🎤 Voice transcription unavailable — GROQ_API_KEY not configured.");
        return;
    }

    console.log(`\n🎤 ${userName}: [voice message]`);
    await ctx.replyWithChatAction("typing");

    try {
        // Download voice file from Telegram
        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
        const response = await fetch(fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuffer);

        // Transcribe
        console.log(`  📝 Transcribing (${audioBuffer.length} bytes)...`);
        const transcription = await transcribe(audioBuffer, file.file_path ?? "voice.ogg");
        console.log(`  📝 Transcription: "${transcription}"`);

        // Show the user what we heard
        await ctx.reply(`🎤 _"${transcription}"_`, { parse_mode: "Markdown" });

        // Run through agent loop
        await ctx.replyWithChatAction("typing");
        const agentResponse = await runAgentLoop(transcription);

        // Reply with voice + text
        await sendResponse(ctx, agentResponse, true);
    } catch (err) {
        console.error("❌ Voice error:", err);
        await ctx.reply("Something went wrong processing the voice message.");
    } finally {
        resetToDefaultModel();
    }
});

// ─── Text Message Handler ────────────────────────────────

bot.on("message:text", async (ctx) => {
    const userMessage = ctx.message.text;
    const userName = ctx.from.first_name;

    console.log(`\n💬 ${userName}: ${userMessage}`);
    await ctx.replyWithChatAction("typing");

    try {
        const response = await runAgentLoop(userMessage);
        await sendResponse(ctx, response, isVoiceReplyEnabled());
    } catch (err) {
        console.error("❌ Agent error:", err);
        await ctx.reply("Something went wrong. Check the logs for details.");
    } finally {
        resetToDefaultModel();
    }
});

// ─── Response Helpers ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendResponse(ctx: any, text: string, withVoice: boolean): Promise<void> {
    // Always send text
    if (text.length <= 4096) {
        await ctx.reply(text, { parse_mode: "Markdown" });
    } else {
        const chunks = splitMessage(text, 4096);
        for (const chunk of chunks) {
            await ctx.reply(chunk, { parse_mode: "Markdown" });
        }
    }
    console.log(`  🤖 Response sent (${text.length} chars)`);

    // Optionally send voice
    if (withVoice && canSynthesize()) {
        try {
            console.log(`  🔊 Synthesizing voice...`);
            await ctx.replyWithChatAction("upload_voice");
            const audio = await synthesize(text);
            await ctx.replyWithVoice(audio);
            console.log(`  🔊 Voice reply sent`);
        } catch (err) {
            console.error("  ⚠️ TTS failed (text reply was still sent):", err);
        }
    }
}

function splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        let splitIndex = remaining.lastIndexOf("\n", maxLength);
        if (splitIndex === -1 || splitIndex < maxLength / 2) {
            splitIndex = remaining.lastIndexOf(" ", maxLength);
        }
        if (splitIndex === -1 || splitIndex < maxLength / 2) {
            splitIndex = maxLength;
        }

        chunks.push(remaining.substring(0, splitIndex));
        remaining = remaining.substring(splitIndex).trimStart();
    }

    return chunks;
}
