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
import { google } from "googleapis";
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
        // Initialize direct Gmail API fallback since MCP is failing
        if (!process.env.GMAIL_CREDENTIALS_JSON || !process.env.GMAIL_TOKEN_JSON) {
            throw new Error("Missing GMAIL_CREDENTIALS_JSON or GMAIL_TOKEN_JSON environment variables for Gmail fallback.");
        }

        const credentials = JSON.parse(process.env.GMAIL_CREDENTIALS_JSON);
        const token = JSON.parse(process.env.GMAIL_TOKEN_JSON);

        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        oAuth2Client.setCredentials(token);

        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

        // 2. Ensure Google Sheet has headers
        try {
            await ensureSheetHeaders();
        } catch (e) {
            console.warn("[Email Scan] Could not ensure sheet headers:", e);
        }

        // 3. Fetch unread emails directly
        const searchRes = await gmail.users.messages.list({
            userId: 'me',
            q: "is:unread in:inbox",
            maxResults: 50
        });

        const messages = searchRes.data.messages || [];

        if (messages.length === 0) {
            const msg = `📬 *Email Scan Complete* — No new unread emails found.`;
            await sendTelegram(msg);
            return res.status(200).json({ ok: true, ...results });
        }

        results.scanned = messages.length;
        console.log(`[Email Scan] Found ${messages.length} unread emails.`);

        // 4. Process each email
        for (const msg of messages) {
            const emailId = msg.id;
            if (!emailId) continue;

            try {
                const messageData = await gmail.users.messages.get({
                    userId: 'me',
                    id: emailId,
                    format: 'full'
                });

                const headers = messageData.data.payload?.headers || [];
                const fromHeader = headers.find(h => h.name === 'From')?.value || '';
                const subjectHeader = headers.find(h => h.name === 'Subject')?.value || '';
                const dateHeader = headers.find(h => h.name === 'Date')?.value || new Date().toISOString();

                // Simplify body extraction for text/plain or HTML
                let body = "";
                if (messageData.data.payload?.parts) {
                    const textPart = messageData.data.payload.parts.find(p => p.mimeType === 'text/plain');
                    if (textPart && textPart.body?.data) {
                        body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
                    }
                } else if (messageData.data.payload?.body?.data) {
                    body = Buffer.from(messageData.data.payload.body.data, 'base64').toString('utf8');
                }

                const email = {
                    id: emailId,
                    threadId: messageData.data.threadId || emailId,
                    from: fromHeader,
                    fromEmail: fromHeader.match(/<(.+)>/)?.[1] || fromHeader,
                    subject: subjectHeader,
                    snippet: messageData.data.snippet || "",
                    body: body,
                    date: dateHeader
                };

                const classification = classifyEmail(email);
                console.log(`[Email Scan] ${email.fromEmail}: ${classification.category} (${classification.confidence}) — ${classification.reason}`);

                if (classification.category === "job-board") {
                    results.jobBoard++;
                    // Remove INBOX and UNREAD labels (effectively archiving)
                    await gmail.users.messages.modify({
                        userId: 'me',
                        id: emailId,
                        requestBody: { removeLabelIds: ['INBOX', 'UNREAD'] }
                    });

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
                    await gmail.users.messages.modify({
                        userId: 'me',
                        id: emailId,
                        requestBody: { removeLabelIds: ['UNREAD'] }
                    });
                    results.drafts.push(`• *${role}* at ${company} (${recruiterName})`);

                } else {
                    results.other++;
                    await gmail.users.messages.modify({
                        userId: 'me',
                        id: emailId,
                        requestBody: { removeLabelIds: ['UNREAD'] }
                    });
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
