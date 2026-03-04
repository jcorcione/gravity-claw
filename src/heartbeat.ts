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

// ─── Intelligence Briefing Prompt ──────────────────────────────

const BRIEFING_PROMPT = `You are running John Corcione's morning intelligence briefing. Execute the following steps and compile a clean report. Do NOT show raw JSON or tool call details — only a clean formatted summary.

STEP 1 — RECRUITER EMAIL SCAN:
Run scan_recruiter_emails (max 10). Report: how many emails, any recruiter contacts found, any cover letters drafted.

STEP 2 — TRENDING TOPICS (use Tavily MCP search):
- Search: "trending Christian faith prayer encouragement YouTube Shorts 2026"
- Search: "trending AI tools freelancing gig economy apps 2026"
Report 2-3 actionable trending topics per channel.

STEP 3 — TODAY'S CALENDAR:
Run search_calendar for today. Report any events or deadlines.

STEP 4 — COMPILE & SEND:
Format the briefing as:

☀️ *Good morning John — Gravity Claw Intel Brief* [date]

📧 *Email:* [recruiter summary or "Inbox clear"]
🔥 *Grace Note Trends:* [topic 1, topic 2]
⚡ *Gigawerx Trends:* [topic 1, topic 2]
📅 *Today:* [events or "Nothing scheduled"]

Keep it under 10 sentences. Only flag what needs attention.`;

const CHECKIN_PROMPT = `Quick check-in from Gravity Claw. Use get_current_time to get the time. Run search_semantic_memory for any pending tasks or reminders. Send a 1-2 sentence check-in only if there's something worth flagging. Otherwise stay quiet.`;

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

    // Built-in: Morning intelligence briefing (8AM ET = 13:00 UTC)
    const morningCron = process.env["HEARTBEAT_MORNING_CRON"] ?? "0 13 * * *";
    startJob("builtin_morning", morningCron, BRIEFING_PROMPT, "Morning Intel Brief");

    // Built-in: Periodic check-in (optional, disabled by default)
    const checkinEnabled = process.env["HEARTBEAT_CHECKIN_ENABLED"] === "true";
    if (checkinEnabled) {
        const checkinCron = process.env["HEARTBEAT_CHECKIN_CRON"] ?? "30 * * * *";
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
