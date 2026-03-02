import fetch from "node-fetch";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";

// Best model for creative, humanized content writing
// Claude 3.5 Sonnet is excellent for natural-sounding scripts
const CREATIVE_MODEL = "anthropic/claude-3.5-sonnet";

function getOpenRouterKey(): string {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY not set.");
    return key;
}

// ─── Grace Note Inspirations System Prompt ────────────────────────────────────
const GRACE_NOTE_SYSTEM = `You are a spiritual content scriptwriter for Grace Note Inspirations, a Christian faceless YouTube Shorts channel.

Your scripts follow a strict 3-part format for maximum retention and impact:

**PART 1 — STRONG HOOK (0–3 seconds)**
- Open with the raw pain point — make the viewer feel seen immediately
- Use second-person ("You've been..."), present tense, emotionally charged language
- DO NOT give the answer here. Create curiosity and urgency
- Examples: "You've been praying the same prayer for years and nothing's changing."
  "You feel invisible. Like God forgot about you."

**PART 2 — PRAYER / VERSE / SOLUTION (3–45 seconds)**
- Transition with empathy: "But here's what God says about that..."
- Include a specific Bible verse (book, chapter:verse) directly relevant to the pain
- Speak it out as a short prayer or affirmation the viewer says WITH you
- Keep language conversational, warm, intimate — like a trusted friend, NOT a preacher
- Use pauses indicated by [pause] for emphasis

**PART 3 — STRONG CTA (last 3–5 seconds)**
- Direct, specific, urgent: "Save this for the moment you need it most."
  "Follow — I post a new prayer every day."
- Never say "like and subscribe" — make it feel personal
- End with one short blessing line

**Humanization Rules (CRITICAL):**
- Never use: "delve into", "tapestry", "embrace", "it's important to note", "in today's world"
- Write like a caring friend texts, not like a YouTube creator performs
- Use contractions always (you're, God's, He'll, it's)
- Short sentences. One idea per line. White space matters.
- Emotion over information

**Output Format:**
Return ONLY valid JSON matching this exact structure — no markdown, no explanation outside the JSON:
{
  "channel": "Grace Note Inspirations",
  "topic": "<topic>",
  "painPoint": "<pain point summary>",
  "bibleVerse": { "reference": "Book Chapter:Verse", "text": "full verse text" },
  "script": {
    "hook": "<3-second hook text>",
    "body": "<full prayer/verse/solution — use [pause] markers>",
    "cta": "<strong CTA + blessing>"
  },
  "title": "<SEO-optimized title 60-70 chars>",
  "tags": ["tag1","tag2","tag3","tag4","tag5"],
  "thumbnailConcept": "<text overlay + visual description for faceless thumbnail>",
  "estimatedDuration": "<e.g. '45 seconds'>",
  "scriptForReading": "<full concatenated script as one flowing text>"
}`;

// ─── Gigawerx System Prompt ───────────────────────────────────────────────────
const GIGAWERX_SYSTEM = `You are a viral content scriptwriter for The Gigawerx Channel, a faceless YouTube Shorts channel covering AI tools, gig economy, tech, freelancing, and viral trends.

Your scripts follow a strict 3-part format engineered for maximum Shorts retention:

**PART 1 — STRONG HOOK (0–2 seconds, MAX 15 words)**
- Pattern interrupt. Lead with a shocking stat, bold claim, or contrarian take
- Must make the viewer stop scrolling INSTANTLY
- Examples: "This free AI tool just replaced a $200/hr copywriter."
  "99% of freelancers don't know about this income stream."

**PART 2 — PROBLEM → SOLUTION (2–40 seconds)**
- Name the problem the audience faces (2-3 sentences max)
- Deliver the solution in a punchy list or step format
- Each point = 1 sentence. Keep it moving fast.
- Use power words: "instantly", "free", "secret", "nobody talks about this"
- Reference real tools, real numbers, real results where possible

**PART 3 — STRONG CTA (last 3 seconds)**
- Specific action + specific reason: "Follow for one AI income tip per day."
  "Drop 'TOOL' in the comments and I'll DM you the full list."
- Create urgency or exclusivity

**Humanization Rules (CRITICAL):**
- Sound like a knowledgeable friend sharing a secret, not a YouTube guru performing
- Never use: "dive deep", "game-changing", "in today's fast-paced world", "leverage synergies"
- Use contractions always
- Punchy. Fast. No filler words.
- Each sentence is its own line for teleprompter-style reading

**Output Format:**
Return ONLY valid JSON matching this exact structure — no markdown, no explanation outside the JSON:
{
  "channel": "The Gigawerx Channel",
  "topic": "<topic>",
  "hook": "<2-second hook>",
  "script": {
    "hook": "<hook text>",
    "body": "<problem + solution — fast-paced, punchy>",
    "cta": "<strong CTA>"
  },
  "title": "<SEO-optimized title 60-70 chars>",
  "tags": ["tag1","tag2","tag3","tag4","tag5"],
  "thumbnailConcept": "<bold text overlay + visual for faceless thumbnail>",
  "estimatedDuration": "<e.g. '30 seconds'>",
  "scriptForReading": "<full concatenated script as one flowing text>"
}`;

async function generateScript(
    systemPrompt: string,
    userPrompt: string
): Promise<string> {
    const key = getOpenRouterKey();
    const res = await fetch(OPENROUTER_BASE, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://gravity-claw-production-d161.up.railway.app",
            "X-Title": "Gravity Claw Script Generator",
        },
        body: JSON.stringify({
            model: CREATIVE_MODEL,
            temperature: 0.85, // Higher temp for creativity
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]
        })
    });

    const data = await res.json() as any;
    if (data.error) throw new Error(`OpenRouter error: ${data.error.message}`);
    return data.choices?.[0]?.message?.content || "";
}

export const youtubeScriptGeneratorTool = {
    name: "youtube_script_generator",
    description: `Generates a complete, humanized, faceless YouTube Shorts script for either the Grace Note Inspirations channel (3-part: Pain Point → Prayer/Bible Verse → Strong CTA) or The Gigawerx Channel (3-part: Strong Hook → Problem/Solution → Strong CTA).
    Produces: full script, SEO title, hashtags, thumbnail concept, and estimated duration.
    Uses a high-creativity AI model tuned for natural, non-robotic content.`,
    inputSchema: {
        type: "object",
        properties: {
            channel: {
                type: "string",
                enum: ["gracenote", "gigawerx"],
                description: "Which channel to write for: 'gracenote' = Grace Note Inspirations (spiritual/prayer), 'gigawerx' = The Gigawerx Channel (tech/gig/AI)"
            },
            topic: {
                type: "string",
                description: "The topic, pain point, or idea for the video. Be specific. Examples: 'feeling forgotten by God during financial hardship', 'AI tools that replace expensive freelancers', 'prayer for anxiety about the future'"
            },
            target_duration: {
                type: "string",
                enum: ["30s", "45s", "60s"],
                description: "Target Shorts length. Default '45s'."
            },
            additional_context: {
                type: "string",
                description: "Optional extra context: specific Bible verse to include, trending angle, product to mention, etc."
            }
        },
        required: ["channel", "topic"]
    },
    execute: async (input: Record<string, unknown>) => {
        const channel = String(input.channel || "gracenote");
        const topic = String(input.topic || "");
        const duration = String(input.target_duration || "45s");
        const extraContext = input.additional_context ? `\n\nAdditional context: ${input.additional_context}` : "";

        console.log(`[Tool: youtube_script_generator] Channel: ${channel}, Topic: ${topic}`);

        const systemPrompt = channel === "gigawerx" ? GIGAWERX_SYSTEM : GRACE_NOTE_SYSTEM;

        const userPrompt = channel === "gigawerx"
            ? `Write a ${duration} Shorts script for The Gigawerx Channel about: "${topic}"${extraContext}`
            : `Write a ${duration} Shorts script for Grace Note Inspirations about: "${topic}"${extraContext}

Remember:
- Choose a Bible verse that directly addresses this pain point
- The prayer should feel personal and immediate, not religious-performance
- Make the viewer feel deeply understood before offering the solution`;

        try {
            const raw = await generateScript(systemPrompt, userPrompt);

            // Extract JSON from the response
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return raw; // Return raw if no JSON found
            }

            const parsed = JSON.parse(jsonMatch[0]);
            return JSON.stringify({
                ...parsed,
                generatedAt: new Date().toISOString(),
                model: CREATIVE_MODEL,
                instructions: "Copy 'scriptForReading' into CapCut teleprompter. Use 'thumbnailConcept' for image generation."
            }, null, 2);

        } catch (err: any) {
            return `Error generating script: ${err.message}`;
        }
    }
};
