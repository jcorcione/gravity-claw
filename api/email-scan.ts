/**
 * Email Scan Cron Endpoint
 * Triggered by Vercel Cron at 9:30 AM EST (14:30 UTC) and 3:00 PM EST (20:00 UTC) on weekdays.
 * Can also be triggered manually via GET for testing.
 * 
 * Flow:
 * 1. Fetch unread inbox emails
 * 2. Classify each as recruiter / job-board / other
 * 3. Job-board → label "Job Board Emails" + archive
 * 4. Recruiter → generate cover letter draft + log to Sheets
 * 5. Send Telegram summary
 */

import { VercelRequest, VercelResponse } from "@vercel/node";
import { classifyEmail, extractJobDetails } from "../src/email-classifier.js";
import { generateCoverLetter } from "../src/cover-letter.js";
import { appendDraftLog, ensureSheetHeaders } from "../src/sheets.js";
import { initMcpServers, getMcpTools } from "../src/mcp.js";
import dotenv from "dotenv";

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.ALLOWED_USER_IDS?.split(",")[0];

async function sendTelegram(message: string): Promise<void> {
    if (!BOT_TOKEN || !CHAT_ID) return;
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: "Markdown",
            }),
        });
    } catch (e) {
        console.error("[Email Scan] Failed to send Telegram notification:", e);
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const startTime = Date.now();
    console.log("[Email Scan] Starting recruiter email scan via MCP...");

    const results = {
        scanned: 0,
        recruiter: 0,
        jobBoard: 0,
        other: 0,
        errors: 0,
        drafts: [] as string[],
    };

    try {
        // 1. Ensure MCP Server is booted for this serverless function run
        await initMcpServers();
        const tools = getMcpTools();
        const searchTool = tools.find(t => t.name === "mcp_gmail_gmail_list_messages");
        const readTool = tools.find(t => t.name === "mcp_gmail_gmail_get_message");
        const updateTool = tools.find(t => t.name === "mcp_gmail_gmail_modify_message");

        if (!searchTool || !readTool || !updateTool) {
            throw new Error("Gmail MCP tools not found. Check MCP_SERVERS config.");
        }

        // 2. Ensure Google Sheet has headers
        try {
            await ensureSheetHeaders();
        } catch (e) {
            console.warn("[Email Scan] Could not ensure sheet headers:", e);
        }

        // 3. Fetch unread emails
        let searchResultRaw;
        try {
            const context = { userId: "default_user" };
            searchResultRaw = await searchTool.execute({ q: "is:unread in:inbox", max_results: 50 }, context);
        } catch (e: any) {
            throw new Error(`Error fetching emails via MCP: ${e.message}`);
        }

        let messages = [];
        try {
            messages = typeof searchResultRaw === "string" ? JSON.parse(searchResultRaw) : searchResultRaw;
        } catch (e) { }

        if (!messages || messages.length === 0) {
            const msg = `📬 *Email Scan Complete* — No new unread emails found.`;
            await sendTelegram(msg);
            return res.status(200).json({ ok: true, ...results });
        }

        results.scanned = messages.length;
        console.log(`[Email Scan] Found ${messages.length} unread emails.`);

        const context = { userId: "default_user" };

        // 4. Process each email
        for (const msg of messages) {
            const emailId = msg.id || msg.messageId;
            if (!emailId) continue;

            try {
                const contentRaw = await readTool.execute({ id: emailId, format: "full" }, context);
                let contentData;
                try {
                    contentData = typeof contentRaw === "string" ? JSON.parse(contentRaw) : contentRaw;
                } catch { continue; }

                const fromHeader = contentData.headers?.From || contentData.from || "";
                const subjectHeader = contentData.headers?.Subject || contentData.subject || "";

                const email = {
                    id: emailId,
                    threadId: contentData.threadId || emailId,
                    from: fromHeader,
                    fromEmail: fromHeader.match(/<(.+)>/)?.[1] || fromHeader,
                    subject: subjectHeader,
                    snippet: contentData.snippet || "",
                    body: contentData.textBody || contentData.body || "",
                    date: contentData.headers?.Date || contentData.date || new Date().toISOString()
                };

                const classification = classifyEmail(email);
                console.log(`[Email Scan] ${email.fromEmail}: ${classification.category} (${classification.confidence}) — ${classification.reason}`);

                if (classification.category === "job-board") {
                    results.jobBoard++;
                    // Remove INBOX and UNREAD labels (effectively archiving)
                    await updateTool.execute({ id: emailId, remove_label_ids: ["INBOX", "UNREAD"] }, context);

                } else if (classification.category === "recruiter") {
                    results.recruiter++;
                    const { company, role, recruiterName } = extractJobDetails(email);
                    const draft = await generateCoverLetter(email, role, company);

                    await appendDraftLog({
                        date: new Date().toLocaleDateString("en-US"),
                        recruiterName,
                        recruiterEmail: email.fromEmail,
                        company,
                        role,
                        coverLetterDraft: draft,
                        status: "Draft",
                    });

                    // Mark as read
                    await updateTool.execute({ id: emailId, remove_label_ids: ["UNREAD"] }, context);
                    results.drafts.push(`• *${role}* at ${company} (${recruiterName})`);

                } else {
                    results.other++;
                    await updateTool.execute({ id: emailId, remove_label_ids: ["UNREAD"] }, context);
                }

            } catch (emailErr: any) {
                results.errors++;
                console.error(`[Email Scan] Error processing ID ${emailId}:`, emailErr.message);
            }
        }

        // 5. Send Telegram summary
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        let summary = `📬 *Recruiter Email Scan Complete* (${elapsed}s)\n\n`;
        summary += `📩 Scanned: *${results.scanned}* emails\n`;
        summary += `🤖 Job Boards Archived: *${results.jobBoard}*\n`;
        summary += `👤 Recruiter Emails: *${results.recruiter}*\n`;

        if (results.drafts.length > 0) {
            summary += `\n✍️ *Cover Letter Drafts Added to Sheet:*\n${results.drafts.join("\n")}`;
            summary += `\n\n[View Drafts](https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEETS_SPREADSHEET_ID})`;
        }

        if (results.errors > 0) {
            summary += `\n\n⚠️ Errors: ${results.errors}`;
        }

        await sendTelegram(summary);
        console.log("[Email Scan] Complete.");
        return res.status(200).json({ ok: true, ...results });

    } catch (err: any) {
        console.error("[Email Scan] Fatal error:", err);
        await sendTelegram(`❌ *Email Scan Failed:* ${err.message}`);
        return res.status(500).json({ error: err.message });
    }
}
