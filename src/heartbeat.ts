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

const BRIEFING_PROMPT = `You are running John Corcione's hourly intelligence briefing. Execute the following steps in order and compile a clean report. Do NOT show raw JSON or tool call details — only a clean formatted summary.

STEP 1 — RECRUITER EMAIL SCAN:
Run scan_recruiter_emails (max 10). Report: how many emails scanned, any recruiter contacts found, any cover letters drafted.

STEP 2 — YOUTUBE CHANNEL PERFORMANCE:
Run youtube_analytics for channel="@gracenoteinspriations" and then for channel="@gigawerx" (type="overview"). Report key stats: subscribers, recent views, any notable trends.

STEP 3 — TRENDING TOPICS (use Tavily search MCP):
- Search: "trending Christian faith prayer YouTube Shorts 2026"
- Search: "trending AI tools freelancing gig economy 2026"
Report the 2-3 most actionable trending topics found for each channel.

STEP 4 — TODAY'S CALENDAR:
Run search_calendar for today's date. Report any events, deadlines, or reminders.

STEP 5 — BASEROW PIPELINE STATUS:
Run baserow_content (action=list_pending). Report how many videos are pending in each channel.

STEP 6 — COMPILE REPORT:
Send John a clean briefing using this format:

☀️ *Gravity Claw Intel Brief* — [time/date]

📧 *Email Scan:* [summary]
📺 *YouTube:* [brief channel stats]
🔥 *Hot Topics:*
• Grace Note: [topic]
• Gigawerx: [topic]
📅 *Calendar:* [today's events or "Nothing scheduled"]
🎬 *Pipeline:* [X videos pending]

Keep it tight — 10 sentences max total. Only flag things that need John's attention.`;

const CHECKIN_PROMPT = `Quick proactive check-in from Gravity Claw. Use get_current_time to get the time. Run search_semantic_memory for any pending tasks or reminders. Send a 1-2 sentence check-in only if there's something worth flagging. Otherwise skip.`;

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

    // Built-in: Hourly intelligence briefing (every 60 minutes)
    const morningCron = process.env["HEARTBEAT_MORNING_CRON"] ?? "0 * * * *";
    startJob("builtin_morning", morningCron, BRIEFING_PROMPT, "Hourly Intel Brief");

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
