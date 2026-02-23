import type { Tool } from "./index.js";
import { classifyEmail, extractJobDetails } from "../email-classifier.js";
import { generateCoverLetter } from "../cover-letter.js";
import { appendDraftLog, ensureSheetHeaders } from "../sheets.js";
import { getMcpTools } from "../mcp.js";

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
        const tools = getMcpTools();
        const searchTool = tools.find(t => t.name === "mcp_gmail_gmail_list_messages");
        const readTool = tools.find(t => t.name === "mcp_gmail_gmail_get_message");
        const updateTool = tools.find(t => t.name === "mcp_gmail_gmail_modify_message");

        if (!searchTool || !readTool || !updateTool) {
            return "Error: Gmail MCP tools are not fully loaded or connected. Ensure the Gmail MCP server is running.";
        }

        const maxEmails = (input.maxEmails as number) || 20;

        try {
            await ensureSheetHeaders();
        } catch (e) {
            console.warn("Could not ensure sheet headers:", e);
        }

        let searchResultRaw;
        try {
            searchResultRaw = await searchTool.execute({ q: "is:unread in:inbox", max_results: maxEmails }, context);
        } catch (e: any) {
            return `Error fetching emails via MCP: ${e.message}`;
        }

        // Output of gmail_search_emails is usually a stringified JSON array
        let messages = [];
        try {
            if (typeof searchResultRaw === "string") {
                messages = JSON.parse(searchResultRaw);
            } else {
                messages = searchResultRaw as any[];
            }
        } catch (e) {
            // If it's pure text, try to extract IDs
            return `Failed to parse search results from MCP: ${searchResultRaw}`;
        }

        if (!messages || messages.length === 0) {
            return "Scan complete. No unread emails found in inbox.";
        }

        let summary = `Scanned ${messages.length} unread emails:\n\n`;
        let drafts = 0;
        let archived = 0;

        for (const msg of messages) {
            const emailId = msg.id || msg.messageId; // different MCPs might use different keys
            if (!emailId) continue;

            try {
                // Read full content to classify
                const contentRaw = await readTool.execute({ id: emailId, format: "full" }, context);
                let contentData;

                try {
                    contentData = typeof contentRaw === "string" ? JSON.parse(contentRaw) : contentRaw;
                } catch {
                    continue; // Skip if we can't parse
                }

                // Normalizing to our internal EmailSummary type for the existing codebase functions
                const fromHeader = contentData.headers?.From || contentData.from || "";
                const subjectHeader = contentData.headers?.Subject || contentData.subject || "";

                const email: EmailSummary = {
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

                if (classification.category === "job-board") {
                    // Archive
                    await updateTool.execute({ id: emailId, remove_label_ids: ["INBOX", "UNREAD"] }, context);
                    archived++;
                    summary += `🗑️ Archived Job Board: ${email.subject}\n`;
                } else if (classification.category === "recruiter") {
                    // Generate draft
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
                    drafts++;
                    summary += `✍️ Drafted Cover Letter: ${role} at ${company} (${recruiterName})\n`;
                } else {
                    // Other - just mark as read
                    await updateTool.execute({ id: emailId, remove_label_ids: ["UNREAD"] }, context);
                }

            } catch (e: any) {
                summary += `⚠️ Error processing ID ${emailId}: ${e.message}\n`;
            }
        }

        summary += `\n**Totals:** ${drafts} Cover Letters Drafted, ${archived} Job Alerts Archived.`;
        return summary;
    }
};
