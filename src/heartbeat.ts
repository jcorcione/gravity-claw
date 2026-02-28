import cron from "node-cron";
import { Bot } from "grammy";
import { config } from "./config.js";
import { runAgentLoop } from "./agent.js";
import { listSchedules, type Schedule } from "./memory-pg.js";
import { resetToDefaultModel } from "./models.js";

// ─── Types ───────────────────────────────────────────────

interface ActiveJob {
    schedule: Schedule | { id: string; name: string; cron: string; prompt: string };
    task: cron.ScheduledTask;
}

// ─── State ───────────────────────────────────────────────

const activeJobs = new Map<string, ActiveJob>();
let botInstance: Bot | null = null;

// ─── Morning Briefing Prompt ─────────────────────────────

const BRIEFING_PROMPT = `You are running a proactive morning briefing. The user hasn't asked for this — you're reaching out.

DO THIS:
1. Use get_current_time to check the current time and day.
2. Use search_memory to find any relevant memories (preferences, tasks, events, reminders).
3. Use check_openrouter_balance to see your remaining AI funds.
4. Compose a brief, friendly morning message that includes:
   - A greeting with the day/date
   - Any relevant reminders from memory
   - Your remaining OpenRouter balance (only if it's getting low!)
   - Something useful or encouraging

Keep it SHORT — 3-5 sentences max. This is a quick check-in, not an essay.
Start with a greeting emoji like ☀️ or 🌅.`;

const CHECKIN_PROMPT = `You are running a proactive check-in. The user hasn't asked for this — you're reaching out.

DO THIS:
1. Use get_current_time to check the time.
2. Use search_memory to recall anything relevant.
3. Send a brief, helpful message — one or two sentences.

Be useful, not annoying. Only send if there's something worth saying.
If you have nothing relevant, just say a brief friendly check-in.`;

// ─── Send Proactive Message ──────────────────────────────

async function sendProactiveMessage(prompt: string, label: string): Promise<void> {
    if (!botInstance) return;

    console.log(`\n⏰ Heartbeat: ${label}`);

    try {
        const response = await runAgentLoop(prompt);

        // Send to all allowed users
        for (const userId of config.allowedUserIds) {
            try {
                await botInstance.api.sendMessage(userId, response, {
                    parse_mode: "Markdown",
                });
                console.log(`  📤 Sent to user ${userId} (${response.length} chars)`);
            } catch (err) {
                console.error(`  ❌ Failed to send to user ${userId}:`, err);
            }
        }
    } catch (err) {
        console.error(`  ❌ Heartbeat error (${label}):`, err);
    } finally {
        resetToDefaultModel();
    }
}

// ─── Trigger Briefing Manually ───────────────────────────

export async function triggerBriefing(): Promise<string> {
    return runAgentLoop(BRIEFING_PROMPT);
}

// ─── Schedule Management ─────────────────────────────────

function startJob(id: string, cronExpr: string, prompt: string, name: string): void {
    // Stop existing job with same ID
    stopJob(id);

    if (!cron.validate(cronExpr)) {
        console.error(`  ❌ Invalid cron expression: "${cronExpr}" for schedule "${name}"`);
        return;
    }

    const task = cron.schedule(cronExpr, () => {
        void sendProactiveMessage(prompt, name);
    });

    activeJobs.set(id, {
        schedule: { id, name, cron: cronExpr, prompt },
        task,
    });

    console.log(`  ⏰ Scheduled: "${name}" (${cronExpr})`);
}

function stopJob(id: string): void {
    const job = activeJobs.get(id);
    if (job) {
        job.task.stop();
        activeJobs.delete(id);
    }
}

export function getActiveJobs(): Map<string, ActiveJob> {
    return activeJobs;
}

export function stopAllJobs(): void {
    for (const [id] of activeJobs) {
        stopJob(id);
    }
}

// ─── Initialize ──────────────────────────────────────────

export async function initHeartbeat(bot: Bot): Promise<void> {
    botInstance = bot;

    // Built-in: Morning briefing
    const morningCron = process.env["HEARTBEAT_MORNING_CRON"] ?? "0 8 * * *";
    startJob("builtin_morning", morningCron, BRIEFING_PROMPT, "Morning Briefing");

    // Built-in: Periodic check-in (disabled by default)
    const checkinEnabled = process.env["HEARTBEAT_CHECKIN_ENABLED"] === "true";
    if (checkinEnabled) {
        const checkinCron = process.env["HEARTBEAT_CHECKIN_CRON"] ?? "0 */4 * * *";
        startJob("builtin_checkin", checkinCron, CHECKIN_PROMPT, "Periodic Check-in");
    }

    // Load custom schedules from DB
    const savedSchedules = await listSchedules();
    for (const sched of savedSchedules) {
        startJob(`custom_${sched.id}`, sched.cron, sched.prompt, sched.name);
    }

    console.log(`  Total active schedules: ${activeJobs.size}`);
}

export function registerCustomSchedule(schedule: Schedule): void {
    startJob(`custom_${schedule.id}`, schedule.cron, schedule.prompt, schedule.name);
}

export function unregisterCustomSchedule(id: number): void {
    stopJob(`custom_${id}`);
}

export function formatScheduleList(): string {
    if (activeJobs.size === 0) {
        return "No active schedules.";
    }

    const lines: string[] = [];
    for (const [id, job] of activeJobs) {
        const s = job.schedule;
        const idLabel = id.startsWith("builtin_") ? "built-in" : `id:${s.id}`;
        lines.push(`*${s.name}* (${idLabel})\n  ⏰ \`${s.cron}\`\n  📝 ${s.prompt.substring(0, 60)}...`);
    }
    return lines.join("\n\n");
}
