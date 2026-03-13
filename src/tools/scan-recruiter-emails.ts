import type { Tool } from "./index.js";
import { classifyEmail, extractJobDetails } from "../email-classifier.js";
import { generateCoverLetter } from "../cover-letter.js";
import { appendDraftLog, ensureSheetHeaders } from "../sheets.js";
import { getOrCreateLabel, sendReply } from "../gmail-helpers.js";
import { google } from "googleapis";

const SENDER_EMAIL = "jcorcione@gmail.com";
const RECRUITER_LABEL = "Recruiter Emails";
const JOB_BOARD_LABEL = "Job Board Emails";

interface EmailSummary {
    id: string;
    threadId: string;
    messageId: string;
    from: string;
    fromEmail: string;
    subject: string;
    snippet: string;
    body: string;
    date: string;
}

function getGmailClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error("Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN.");
    }
    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oAuth2Client.setCredentials({ refresh_token: refreshToken });
    return google.gmail({ version: "v1", auth: oAuth2Client });
}

function extractBodyText(payload: any): string {
    const findPart = (parts: any[], mime: string): string | null => {
        for (const part of parts || []) {
            if (part.mimeType === mime && part.body?.data) {
                return Buffer.from(part.body.data, "base64").toString("utf8");
            }
            if (part.parts) {
                const nested = findPart(part.parts, mime);
                if (nested) return nested;
            }
        }
        return null;
    };
    let text = findPart(payload?.parts || [], "text/plain");
    if (!text && payload?.body?.data) {
        text = Buffer.from(payload.body.data, "base64").toString("utf8");
    }
    return text || "";
}

export const scanRecruiterEmailsTool: Tool = {
    name: "scan_recruiter_emails",
    description: "Scan the Gmail inbox for recruiter and job-board emails. Human recruiter emails get an AI-drafted, personalized cover letter reply with resume attached and are labeled + archived to 'Recruiter Emails'. Automated job-board emails are labeled + archived to 'Job Board Emails'. All actions are logged to Google Sheets.",
    inputSchema: {
        type: "object",
        properties: {
            maxEmails: {
                type: "number",
                description: "Maximum unread emails to scan (default 20)."
            },
            dryRun: {
                type: "boolean",
                description: "If true, classify and log but do NOT send replies or archive. Default false."
            }
        }
    },
    execute: async (input) => {
        const gmail = getGmailClient();
        const maxEmails = (input.maxEmails as number) || 20;
        const dryRun = (input.dryRun as boolean) || false;

        // Pre-fetch or create labels
        let recruiterLabelId = "";
        let jobBoardLabelId = "";
        if (!dryRun) {
            try {
                [recruiterLabelId, jobBoardLabelId] = await Promise.all([
                    getOrCreateLabel(gmail, RECRUITER_LABEL),
                    getOrCreateLabel(gmail, JOB_BOARD_LABEL),
                ]);
            } catch (e: any) {
                return `❌ Failed to set up Gmail labels: ${e.message}`;
            }
        }

        try { await ensureSheetHeaders(); } catch { /* non-fatal */ }

        let listRes: any;
        try {
            listRes = await gmail.users.messages.list({
                userId: "me",
                q: "is:unread in:inbox",
                maxResults: maxEmails,
            });
        } catch (e: any) {
            return `❌ Failed to fetch inbox: ${e.message}`;
        }

        const messages = listRes.data.messages || [];
        if (messages.length === 0) {
            return "📭 No unread emails found in inbox.";
        }

        let recruiterCount = 0;
        let jobBoardCount = 0;
        let otherCount = 0;
        const log: string[] = [];

        for (const msg of messages) {
            if (!msg.id) continue;

            try {
                const detail = await gmail.users.messages.get({
                    userId: "me",
                    id: msg.id,
                    format: "full",
                });

                const headers = detail.data.payload?.headers || [];
                const fromHeader = headers.find((h: any) => h.name === "From")?.value || "";
                const subjectHeader = headers.find((h: any) => h.name === "Subject")?.value || "(no subject)";
                const dateHeader = headers.find((h: any) => h.name === "Date")?.value || "";
                const messageIdHeader = headers.find((h: any) => h.name === "Message-ID")?.value || "";

                let body = extractBodyText(detail.data.payload);
                if (body.length > 3000) body = body.substring(0, 3000) + "...[truncated]";

                const email: EmailSummary = {
                    id: msg.id,
                    threadId: detail.data.threadId || msg.id,
                    messageId: messageIdHeader,
                    from: fromHeader,
                    fromEmail: fromHeader.match(/<(.+)>/)?.[1] || fromHeader,
                    subject: subjectHeader,
                    snippet: detail.data.snippet || "",
                    body,
                    date: dateHeader,
                };

                const classification = classifyEmail(email);

                if (classification.category === "job-board") {
                    jobBoardCount++;
                    if (!dryRun) {
                        // Apply Job Board label + archive (remove from inbox + unread)
                        await gmail.users.messages.modify({
                            userId: "me",
                            id: msg.id,
                            requestBody: {
                                addLabelIds: [jobBoardLabelId],
                                removeLabelIds: ["INBOX", "UNREAD"],
                            },
                        });
                    }
                    log.push(`🗄️ [Job Board] ${email.subject} — archived to "${JOB_BOARD_LABEL}"`);

                } else if (classification.category === "recruiter") {
                    recruiterCount++;
                    const { company, role, recruiterName } = extractJobDetails(email);

                    let coverLetter = "";
                    try {
                        coverLetter = await generateCoverLetter(email, role, company);
                    } catch (e: any) {
                        coverLetter = `Hi ${recruiterName},\n\nThank you for reaching out about the ${role} position at ${company}. I'm very interested in learning more. Please find my resume attached.\n\nBest regards,\nJohn Corcione\nSenior IT / Telecom PM | 816-679-3032 | jcorcione@gmail.com`;
                        log.push(`⚠️ LLM cover letter failed, used fallback for: ${email.subject}`);
                    }

                    if (!dryRun) {
                        // Send reply with cover letter + resume attached
                        try {
                            await sendReply({
                                gmail,
                                senderEmail: SENDER_EMAIL,
                                toEmail: email.fromEmail,
                                subject: email.subject,
                                body: coverLetter,
                                threadId: email.threadId,
                                messageId: email.messageId,
                            });
                        } catch (e: any) {
                            log.push(`❌ Failed to send reply for "${email.subject}": ${e.message}`);
                        }

                        // Apply Recruiter label + archive
                        await gmail.users.messages.modify({
                            userId: "me",
                            id: msg.id,
                            requestBody: {
                                addLabelIds: [recruiterLabelId],
                                removeLabelIds: ["INBOX", "UNREAD"],
                            },
                        });
                    }

                    // Log to Google Sheets
                    try {
                        await appendDraftLog({
                            date: new Date().toLocaleDateString("en-US"),
                            recruiterName,
                            recruiterEmail: email.fromEmail,
                            company,
                            role,
                            coverLetterDraft: dryRun ? "[DRY RUN — not sent]" : "[Sent via Gmail]",
                            status: dryRun ? "Dry Run" : "Sent",
                        });
                    } catch { /* non-fatal */ }

                    log.push(`✉️ [Recruiter] ${recruiterName} @ ${company} — "${role}" — reply sent + labeled "${RECRUITER_LABEL}"`);

                } else {
                    otherCount++;
                    // Mark read only, leave in inbox
                    if (!dryRun) {
                        await gmail.users.messages.modify({
                            userId: "me",
                            id: msg.id,
                            requestBody: { removeLabelIds: ["UNREAD"] },
                        });
                    }
                    log.push(`📨 [Other] ${email.subject} — marked read`);
                }

            } catch (e: any) {
                log.push(`⚠️ Error processing ${msg.id}: ${e.message}`);
            }
        }

        const mode = dryRun ? " (DRY RUN — no emails sent)" : "";
        const summary = [
            `✅ Scanned ${messages.length} emails${mode}:`,
            `  ✉️  Recruiter replies sent: ${recruiterCount}`,
            `  🗄️  Job board emails archived: ${jobBoardCount}`,
            `  📨  Other (marked read): ${otherCount}`,
            ``,
            ...log,
        ].join("\n");

        return summary;
    }
};
