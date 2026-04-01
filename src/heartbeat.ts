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

// ─── Scheduled Prompts ──────────────────────────────

const RECRUITER_PROMPT = `You are running John Corcione's Recruiter Pipeline scan. 
Run scan_recruiter_emails (max 10). Report exactly how many recruiter emails you found. If there are strong matches, draft short, professional cover letters for them.

Format the output as:
👔 *Recruiter Pipeline* [date]
- [Summary of recruiter emails]
- [List of any cover letters drafted]

Keep it tight and professional. ONLY report on job leads.`;

const INTEL_PROMPT = `You are running John Corcione's General Intel Briefing.
1) Search/scrape https://jcorcione.com — find the latest articles or posts.
2) Use web search to find the latest general AI news and AI freelancing trends for today.

Format the output as:
☀️ *General Intel Brief* [date]
🌐 *JCorcione.com:* [latest post]
🤖 *AI Trends:* [2-3 hot topics]

Keep it concise, under 8 sentences.`;

const YOUTUBE_CALENDAR_PROMPT = `You are running John's YouTube Trends & Calendar scan.
1) Search the web and Google Trends for "trending tech stories AI tools 2026" (for the Gigawerx channel).
2) Search the web for "trending Christian encouragement prayer faith YouTube Shorts" (for Grace Note).
3) Run search_calendar for today and report any events or deadlines.

Format the output as:
🎥 *YouTube & Calendar Brief* [date]
⚡ *Gigawerx Hub:* [top 2 trending AI topics]
🙏 *Grace Note:* [top 2 faith topics]
📅 *Schedule:* [Today's events or "Clear schedule"]`;

const NEWSLETTER_PROMPT = `You are running the Newsletter & Subscriptions Brief.
Search the Gmail inbox (or designated subscriptions category/labels) for emails from "Kim Komando" (komando.com) and "Tech Brew / Morning Brew" received in the last 24 hours.
Extract and summarize the top tech tips and headlines.

Format the output as:
📰 *Subscriptions Brief* [date]
💡 *Komando:* [top 2 tips]
☕ *Tech Brew:* [top 2 headlines]

Keep it focused and easy to digest.`;

const CHECKIN_PROMPT = `Quick check-in from AgenticHQ. Use get_current_time to get the time. Run search_semantic_memory for any pending tasks or reminders. Send a 1-2 sentence check-in only if there's something worth flagging. Otherwise stay quiet.`;

// ─── Send Proactive Message ──────────────────────────────

async function sendProactiveMessage(prompt: string, label: string): Promise<void> {
    if (!botInstance) return;

    console.log(`\n⏰ Heartbeat: ${label}`);

    try {
        const response = await runAgentLoop(prompt, "default_user", true);

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
    return runAgentLoop(INTEL_PROMPT, "default_user", true);
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
    }, {
        timezone: "America/New_York"
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

    // Built-in Schedules (Times are America/New_York)
    startJob("builtin_recruiter", "0 8 * * *", RECRUITER_PROMPT, "Recruiter Pipeline");
    startJob("builtin_intel", "30 8 * * *", INTEL_PROMPT, "General Intel Brief");
    startJob("builtin_youtube_calendar", "0 9 * * *", YOUTUBE_CALENDAR_PROMPT, "YouTube & Calendar");
    startJob("builtin_newsletter", "30 9 * * *", NEWSLETTER_PROMPT, "Newsletter Brief");

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
