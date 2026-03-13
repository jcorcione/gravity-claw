/**
 * gmail-helpers.ts
 * Shared utilities for building MIME messages, sending Gmail replies,
 * and managing Gmail labels.
 */

import { gmail_v1 } from "googleapis";
import fs from "fs";
import path from "path";

type GmailClient = gmail_v1.Gmail;

// ─── Label Management ─────────────────────────────────────────────

/**
 * Get or create a Gmail label by name. Returns the label ID.
 */
export async function getOrCreateLabel(gmail: GmailClient, name: string): Promise<string> {
    const list = await gmail.users.labels.list({ userId: "me" });
    const existing = (list.data.labels || []).find(l => l.name === name);
    if (existing?.id) return existing.id;

    const created = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
            name,
            labelListVisibility: "labelShow",
            messageListVisibility: "show",
        }
    });
    return created.data.id!;
}

// ─── MIME Message Builder ─────────────────────────────────────────

interface Attachment {
    filename: string;
    filePath: string;
    mimeType: string;
}

/**
 * Build a base64url-encoded RFC2822 MIME message (with optional attachments).
 */
export function buildMimeMessage(params: {
    to: string;
    from: string;
    subject: string;
    body: string;
    inReplyTo?: string;
    references?: string;
    attachments?: Attachment[];
}): string {
    const { to, from, subject, body, inReplyTo, references, attachments = [] } = params;
    const boundary = `boundary_${Date.now()}`;

    const lines: string[] = [
        `To: ${to}`,
        `From: ${from}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
    ];

    if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
    if (references) lines.push(`References: ${references}`);

    if (attachments.length === 0) {
        lines.push(`Content-Type: text/plain; charset=UTF-8`);
        lines.push(``);
        lines.push(body);
    } else {
        lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
        lines.push(``);
        lines.push(`--${boundary}`);
        lines.push(`Content-Type: text/plain; charset=UTF-8`);
        lines.push(`Content-Transfer-Encoding: 7bit`);
        lines.push(``);
        lines.push(body);

        for (const att of attachments) {
            if (!fs.existsSync(att.filePath)) {
                console.warn(`⚠️ Attachment not found, skipping: ${att.filePath}`);
                continue;
            }
            const fileData = fs.readFileSync(att.filePath).toString("base64");
            lines.push(`--${boundary}`);
            lines.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
            lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
            lines.push(`Content-Transfer-Encoding: base64`);
            lines.push(``);
            lines.push(fileData);
        }

        lines.push(`--${boundary}--`);
    }

    const raw = lines.join("\r\n");
    return Buffer.from(raw).toString("base64url");
}

// ─── Send Reply ───────────────────────────────────────────────────

/**
 * Send a reply to an existing email thread, optionally with attachments.
 * Returns the sent message ID.
 */
export async function sendReply(params: {
    gmail: GmailClient;
    senderEmail: string;
    toEmail: string;
    subject: string;
    body: string;
    threadId: string;
    messageId?: string; // The Message-ID header value of the email we're replying to
    attachmentPaths?: string[];
}): Promise<string> {
    const { gmail, senderEmail, toEmail, subject, body, threadId, messageId, attachmentPaths = [] } = params;

    const resumePath = path.resolve("assets/John_Corcione_Resume.docx");
    const attachments: Attachment[] = [
        ...attachmentPaths.map(p => ({
            filename: path.basename(p),
            filePath: p,
            mimeType: "application/octet-stream"
        })),
    ];

    // Always try to attach the resume if it exists
    if (fs.existsSync(resumePath)) {
        attachments.push({
            filename: "John_Corcione_Resume.docx",
            filePath: resumePath,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        });
    }

    const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
    const raw = buildMimeMessage({
        to: toEmail,
        from: senderEmail,
        subject: replySubject,
        body,
        inReplyTo: messageId,
        references: messageId,
        attachments
    });

    const sent = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw, threadId }
    });

    return sent.data.id || "sent";
}
