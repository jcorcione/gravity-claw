import type { Tool } from "./index.js";
import { classifyEmail, extractJobDetails } from "../email-classifier.js";
import { generateCoverLetter } from "../cover-letter.js";
import { appendDraftLog, ensureSheetHeaders } from "../sheets.js";
import { google } from "googleapis";

interface EmailSummary {
    id: string;
    threadId: string;
    from: string;
    fromEmail: string;
    subject: string;
    snippet: string;
    body: string;
    date: string;
}

export const scanRecruiterEmailsTool: Tool = {
    name: "scan_recruiter_emails",
    description: "Scan the user's unread inbox, classify recruiter and job-board emails, automatically archive job board emails, and draft personalized cover letters for human recruiters.",
    inputSchema: {
        type: "object",
        properties: {
            maxEmails: {
                type: "number",
                description: "Maximum number of unread emails to process (default 20)."
            }
        }
    },
    execute: async (input, context) => {
        if (!process.env.GMAIL_CREDENTIALS_JSON || !process.env.GMAIL_TOKEN_JSON) {
            return "Error: Missing GMAIL_CREDENTIALS_JSON or GMAIL_TOKEN_JSON for Gmail fallback.";
        }

        const credentials = JSON.parse(process.env.GMAIL_CREDENTIALS_JSON);
        const token = JSON.parse(process.env.GMAIL_TOKEN_JSON);

        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        oAuth2Client.setCredentials(token);

        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

        const maxEmails = (input.maxEmails as number) || 20;

        try {
            await ensureSheetHeaders();
        } catch (e) {
            console.warn("Could not ensure sheet headers:", e);
        }

        let searchRes;
        try {
            searchRes = await gmail.users.messages.list({
                userId: 'me',
                q: "is:unread in:inbox",
                maxResults: maxEmails
            });
        } catch (e: any) {
            return `Error fetching emails via Gmail API: ${e.message}`;
        }

        const messages = searchRes.data.messages || [];

        if (messages.length === 0) {
            return "Scan complete. No unread emails found in inbox.";
        }

        let summary = `Scanned ${messages.length} unread emails:\n\n`;
        let drafts = 0;
        let archived = 0;

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

                let body = "";
                if (messageData.data.payload?.parts) {
                    const textPart = messageData.data.payload.parts.find(p => p.mimeType === 'text/plain');
                    if (textPart && textPart.body?.data) {
                        body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
                    }
                } else if (messageData.data.payload?.body?.data) {
                    body = Buffer.from(messageData.data.payload.body.data, 'base64').toString('utf8');
                }

                const email: EmailSummary = {
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

                if (classification.category === "job-board") {
                    await gmail.users.messages.modify({
                        userId: 'me',
                        id: emailId,
                        requestBody: { removeLabelIds: ['INBOX', 'UNREAD'] }
                    });
                    archived++;
                    summary += `🗑️ Archived Job Board: ${email.subject}\n`;
                } else if (classification.category === "recruiter") {
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

                    await gmail.users.messages.modify({
                        userId: 'me',
                        id: emailId,
                        requestBody: { removeLabelIds: ['UNREAD'] }
                    });
                    drafts++;
                    summary += `✍️ Drafted Cover Letter: ${role} at ${company} (${recruiterName})\n`;
                } else {
                    await gmail.users.messages.modify({
                        userId: 'me',
                        id: emailId,
                        requestBody: { removeLabelIds: ['UNREAD'] }
                    });
                }

            } catch (e: any) {
                summary += `⚠️ Error processing ID ${emailId}: ${e.message}\n`;
            }
        }

        summary += `\n**Totals:** ${drafts} Cover Letters Drafted, ${archived} Job Alerts Archived.`;
        return summary;
    }
};
