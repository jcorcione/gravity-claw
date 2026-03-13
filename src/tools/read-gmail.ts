import type { Tool } from "./index.js";
import { google } from "googleapis";

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

function decodeBody(payload: any): string {
    // Try plain text first, then HTML stripped of tags
    const findPart = (parts: any[], mimeType: string): string | null => {
        for (const part of parts || []) {
            if (part.mimeType === mimeType && part.body?.data) {
                return Buffer.from(part.body.data, "base64").toString("utf8");
            }
            if (part.parts) {
                const nested = findPart(part.parts, mimeType);
                if (nested) return nested;
            }
        }
        return null;
    };

    let text = findPart(payload?.parts || [], "text/plain");
    if (!text && payload?.body?.data) {
        text = Buffer.from(payload.body.data, "base64").toString("utf8");
    }
    if (!text) {
        // Fall back to HTML stripped of tags
        const html = findPart(payload?.parts || [], "text/html");
        if (html) text = html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
    }
    return text || "";
}

export const readGmailTool: Tool = {
    name: "read_gmail",
    description: `Search and read emails from Gmail. Use this to:
- Read newsletters from specific senders (e.g. "from:techbrew@morningbrew.com")
- Find emails by subject or keyword (e.g. "subject:AI weekly digest")
- Get your inbox digest or morning briefing
- Search any Gmail query (same syntax as Gmail search bar)
Returns email summaries with subject, sender, date, and body excerpt.`,
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "Gmail search query. Examples: 'from:kim@komando.com', 'subject:Tech Brew', 'is:unread in:inbox', 'newer_than:1d'. Default: 'is:unread in:inbox'."
            },
            maxEmails: {
                type: "number",
                description: "Max emails to return (default 10, max 25)."
            },
            fullBody: {
                type: "boolean",
                description: "If true, return full email body (up to 4000 chars). Default false returns a 500 char snippet."
            },
            markAsRead: {
                type: "boolean",
                description: "If true, mark matching emails as read after fetching. Default false."
            }
        },
        required: ["query"]
    },
    execute: async (input) => {
        const query = (input.query as string) || "is:unread in:inbox";
        const maxEmails = Math.min((input.maxEmails as number) || 10, 25);
        const fullBody = (input.fullBody as boolean) || false;
        const markAsRead = (input.markAsRead as boolean) || false;
        const bodyLimit = fullBody ? 4000 : 500;

        let gmail: ReturnType<typeof google.gmail>;
        try {
            gmail = getGmailClient();
        } catch (e: any) {
            return `❌ Gmail auth error: ${e.message}`;
        }

        let listRes: any;
        try {
            listRes = await gmail.users.messages.list({
                userId: "me",
                q: query,
                maxResults: maxEmails
            });
        } catch (e: any) {
            return `❌ Gmail search failed: ${e.message}`;
        }

        const messages = listRes.data.messages || [];
        if (messages.length === 0) {
            return `📭 No emails found for query: "${query}"`;
        }

        const results: string[] = [];

        for (const msg of messages) {
            if (!msg.id) continue;
            try {
                const detail = await gmail.users.messages.get({
                    userId: "me",
                    id: msg.id,
                    format: "full"
                });

                const headers = detail.data.payload?.headers || [];
                const from = headers.find((h: any) => h.name === "From")?.value || "Unknown";
                const subject = headers.find((h: any) => h.name === "Subject")?.value || "(no subject)";
                const date = headers.find((h: any) => h.name === "Date")?.value || "";
                let body = decodeBody(detail.data.payload);

                if (body.length > bodyLimit) {
                    body = body.substring(0, bodyLimit) + "...[truncated]";
                }

                results.push(
                    `📧 **${subject}**\n` +
                    `From: ${from}\n` +
                    `Date: ${date}\n` +
                    `---\n${body.trim()}`
                );

                if (markAsRead) {
                    await gmail.users.messages.modify({
                        userId: "me",
                        id: msg.id,
                        requestBody: { removeLabelIds: ["UNREAD"] }
                    }).catch(() => { });
                }
            } catch (e: any) {
                results.push(`⚠️ Could not fetch email ${msg.id}: ${e.message}`);
            }
        }

        return `Found ${results.length} email(s) for "${query}":\n\n` + results.join("\n\n═══════════════\n\n");
    }
};
