/**
 * Cover letter generator for recruiter emails.
 * Uses the LLM to write a personalized, concise cover letter draft.
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
Email: jcorcione@gmail.com
Background: Experienced technology professional with expertise in AI/ML, automation, cloud infrastructure, and software development.
Key Skills: Python, TypeScript, Node.js, AWS, AI/ML, automation, project management, systems architecture.
Strengths: Builds practical AI systems, strong technical leadership, entrepreneurial mindset.
`;

export async function generateCoverLetter(email: EmailSummary, role: string, company: string): Promise<string> {
    const model = process.env.LLM_MODEL || "stepfun/step-3.5-flash:free";

    const prompt = `You are writing a brief, personalized cover letter response to a recruiter email.

RECRUITER EMAIL:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body.slice(0, 1500)}

CANDIDATE PROFILE:
${CANDIDATE_PROFILE}

INSTRUCTIONS:
- Write a SHORT (3-4 paragraph) cover letter reply
- Be warm but professional
- Reference specific details from the recruiter's email
- Highlight the most relevant skills for: ${role} at ${company}
- End with an invitation to schedule a call
- Do NOT use generic filler phrases
- Write in first person as John

Write ONLY the email body text, no subject line, no headers.`;

    const completion = await client.chat.completions.create({
        model,
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
    });

    return completion.choices[0]?.message?.content || "Could not generate cover letter.";
}
