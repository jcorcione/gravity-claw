/**
 * cover-letter.ts
 * AI-powered cover letter generator and job fit classifier for recruiter emails.
 */

import OpenAI from "openai";
import type { EmailSummary } from "./email-classifier.js";

const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: { "X-Title": "GravityClaw Email Processor" },
});

const CANDIDATE_PROFILE = `
Name: John Corcione
Title: Senior IT / Telecom Project Manager & Scrum Master
Email: jcorcione@gmail.com | Phone: 816-679-3032
LinkedIn: linkedin.com/in/jcorcione
Location: Port Richey, FL (Tampa Bay Area) — open to remote/hybrid
Experience: 20+ years — T-Mobile, JPMorgan Chase, Citibank

TARGET ROLES (STRONG FIT):
- Senior IT Project Manager / Program Manager
- Telecom / Network / Wireless Project Manager
- Cloud Migration Project Manager
- Scrum Master / Agile Coach
- Release Manager / Delivery Manager

WEAK FIT ROLES (adjacent, but not ideal):
- Generic Business Analyst (non-PM)
- Junior PM / Coordinator
- Non-technical or field operations PM

NOT RELEVANT ROLES:
- Sales, customer service, admin, entry-level, warehouse, non-IT

KEY SKILLS: PMP, Scrum, JIRA, Telecom infrastructure, LTE/5G, T-Mobile NSAT, cloud migrations, stakeholder management, budget/schedule control, vendor management.
`;

// ─── Job Fit Classification ───────────────────────────────────────

export type FitLevel = "strong" | "weak" | "irrelevant";

export interface FitResult {
    fit: FitLevel;
    roleTitle: string;
    reason: string;
}

/**
 * Use AI to determine whether the recruiter email is a STRONG/WEAK/IRRELEVANT fit
 * for John's target profile.
 */
export async function classifyJobFit(email: EmailSummary, role: string, company: string): Promise<FitResult> {
    const model = process.env.LLM_MODEL || "moonshotai/kimi-k2:free";

    const prompt = `You are evaluating a recruiter email to determine job fit for a candidate.

CANDIDATE PROFILE:
${CANDIDATE_PROFILE}

RECRUITER EMAIL:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body.slice(0, 1000)}

Extracted Role: ${role}
Extracted Company: ${company}

Respond with EXACTLY this JSON format and nothing else:
{
  "fit": "strong" | "weak" | "irrelevant",
  "roleTitle": "<cleaned up job title>",
  "reason": "<one sentence explanation>"
}

Rules:
- "strong": Role matches telecom PM, IT PM, program manager, scrum master, release manager, cloud PM, delivery manager, or very close
- "weak": Adjacent role (generic BA, junior PM, non-technical PM) — worth a polite decline
- "irrelevant": Sales, entry level, non-IT, clearly wrong — archive silently`;

    try {
        const completion = await client.chat.completions.create({
            model,
            max_tokens: 150,
            messages: [{ role: "user", content: prompt }],
        });

        const text = completion.choices[0]?.message?.content || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                fit: parsed.fit as FitLevel,
                roleTitle: parsed.roleTitle || role,
                reason: parsed.reason || "",
            };
        }
    } catch {
        // Fallback to heuristic if AI fails
    }

    // Heuristic fallback
    const lowerSubject = (email.subject + " " + role).toLowerCase();
    const strongKeywords = ["telecom", "network", "wireless", "it pm", "it project", "program manager", "scrum master", "release manager", "agile", "cloud", "delivery manager", "infrastructure"];
    const weakKeywords = ["business analyst", "ba ", "junior", "coordinator", "associate pm"];
    const irrelevantKeywords = ["sales", "marketing", "warehouse", "customer service", "driver", "technician"];

    if (irrelevantKeywords.some(k => lowerSubject.includes(k))) return { fit: "irrelevant", roleTitle: role, reason: "Non-IT role" };
    if (strongKeywords.some(k => lowerSubject.includes(k))) return { fit: "strong", roleTitle: role, reason: "Matches target role keywords" };
    if (weakKeywords.some(k => lowerSubject.includes(k))) return { fit: "weak", roleTitle: role, reason: "Adjacent but not ideal fit" };

    return { fit: "weak", roleTitle: role, reason: "Unable to determine fit — defaulting to weak" };
}

// ─── Cover Letter Generator ───────────────────────────────────────

export async function generateCoverLetter(email: EmailSummary, role: string, company: string): Promise<string> {
    const model = process.env.LLM_MODEL || "moonshotai/kimi-k2:free";

    const prompt = `You are writing a brief, personalized cover letter response to a recruiter email on behalf of John Corcione.

RECRUITER EMAIL:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body.slice(0, 1500)}

CANDIDATE PROFILE:
${CANDIDATE_PROFILE}

INSTRUCTIONS:
- Write a SHORT (3-4 paragraph) reply
- Be professional but direct — no Gen-X fluff, no "I hope this email finds you well"
- Reference specific details from the recruiter's email (role title, company name if mentioned)
- Highlight John's most relevant background for: ${role} at ${company}
- Mention 20 years of experience at T-Mobile, JPMorgan Chase, Citibank
- Close by inviting a call and noting resume is attached
- Sign off: "Best regards, John Corcione | Senior IT/Telecom PM | 816-679-3032 | jcorcione@gmail.com"

Write ONLY the email body text. No subject line, no headers.`;

    const completion = await client.chat.completions.create({
        model,
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
    });

    return completion.choices[0]?.message?.content || "Could not generate cover letter.";
}

// ─── Polite Decline Generator ─────────────────────────────────────

export async function generatePoliteDecline(email: EmailSummary, role: string, company: string): Promise<string> {
    return `Hi,

Thank you for reaching out about the ${role} position${company && company !== "Unknown Company" ? ` at ${company}` : ""}.

After reviewing the opportunity, I don't think it's the right fit for my background at this time — I'm focused on senior IT/Telecom Project Manager and Scrum Master roles in the telecom, cloud, and financial services space.

That said, if something more aligned comes across your desk, I'd love to hear from you.

Best regards,
John Corcione | Senior IT/Telecom PM | 816-679-3032 | jcorcione@gmail.com`;
}
