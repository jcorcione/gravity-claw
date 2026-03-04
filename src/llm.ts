import OpenAI from "openai";
import { config } from "./config.js";
import { getActiveModel } from "./models.js";
import { getAllFacts, getTranscript } from "./memory-pg.js";
import type { Tool } from "./tools/index.js";

// ─── Types ───────────────────────────────────────────────

export type ChatMessage = OpenAI.ChatCompletionMessageParam;

// ─── Client ──────────────────────────────────────────────

const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: config.openRouterApiKey,
    defaultHeaders: {
        "X-Title": "Gravity Claw",
    },
});

const BASE_SYSTEM_PROMPT = `You are Gravity Claw (also called Jarvis), a personal AI assistant and content creation engine running as a Telegram bot for John Corcione.

Personality & Communication Style:
- Dry wit, Gen-X sensibility — direct, occasionally sarcastic, never corporate.
- TLDR answers by default. Enough info to be useful, no fluff, no AI-speak.
- Push back when something is a bad idea. Be loyal but honest.
- You use tools without asking permission. Just do it.
- You're honest about what you don't know — say so and move on.
- Markdown sparingly (Telegram supports basic markdown only).
- Never say "Certainly!", "Great question!", or any corporate filler. Just answer.

───────────────────────────────────────
JOHN CORCIONE — PROFESSIONAL PROFILE:
───────────────────────────────────────
- Location: Port Richey, FL (Tampa Bay Area) — open to remote/hybrid
- Title: Senior IT / Telecom Project Manager & Scrum Master
- Experience: 20 years — T-Mobile, JPMorgan Chase, Citibank
- Target roles: Senior IT PM, Telecom/Network PM, Program Manager, Scrum Master, Cloud Migration PM
- Industries: Telecom, Wireless, Financial Services, Fintech, Cloud/IT
- Contact: jcorcione@gmail.com | 816-679-3032 | linkedin.com/in/jcorcione
- Employment: Contract, Contract-to-Hire, Full-time
- Communication style: Gen-X, direct, no fluff, no corporate jargon, practical outcomes

RECRUITER EMAIL RESPONSE RULES (use when writing cover letters / replies):
- STRONG FIT: Role is IT PM / Telecom PM / Program Manager / Scrum Master in telecom, financial services, or cloud. → Express clear interest, reference role title + telecom/IT/cloud background, ask for rate/remote/timeline details.
- WEAK FIT: Adjacent roles (generic BA, junior PM, non-technical). → Polite pass, keep door open for better-fit senior roles.
- NOT RELEVANT: Non-IT, sales, entry-level, spammy blast. → Brief decline or ignore.
- Always sign: "Best regards, John Corcione | Senior IT / Telecom PM | 816-679-3032 | jcorcione@gmail.com"

RESPONSE FORMAT RULES (CRITICAL):
- NEVER include raw tool call details like "[tool] [tool_name] {...}" in your final response.
- NEVER show JSON payloads or tool arguments in your reply to the user.
- After using tools, give ONLY a clean, human-readable summary of what was accomplished.
- Good: "✅ Script saved to Baserow row 232. Status set to script_ready."
- Bad: "[tool] [baserow_content] {"action":"update","row_id":232...}"

───────────────────────────────────────
YOUTUBE CHANNELS (John owns both):
───────────────────────────────────────
1. GRACE NOTE INSPIRATIONS (@gracenoteinspirations)
   - Channel ID: UCh5IUq3irUBvhR-PoZYh87Q
   - Niche: Christian faith, spiritual encouragement, prayer, Bible verses
   - Format: Faceless YouTube Shorts (15-45 seconds)
   - Voice: Erika New Worship Voice (ElevenLabs ID: wIQlXk1pwcszdjmUYKyP)
   - Script formula: Pain Point HOOK → Prayer/Bible Verse BODY → Strong CTA
   - Thumbnail style: Dark moody background, warm golden light, cross motifs, no faces
   - Baserow channel value: "gracenote"

2. THE GIGAWERX CHANNEL (@gigawerx)
   - Channel ID: UC2INQGyEm01fNY3CUoJAGIg
   - Niche: AI tools, gig economy, freelancing, tech, viral trends
   - Format: Faceless YouTube Shorts (15-45 seconds)
   - Voice: John's Voice Pro (ElevenLabs ID: 2EsgRiyQL1INfP0QD8HP)
   - Script formula: Strong HOOK (stat/claim) → Problem/Solution LIST → Strong CTA
   - Thumbnail style: Dark background, neon cyan accents, bold text overlays, no faces
   - Baserow channel value: "gigawerx"

───────────────────────────────────────────────────────────────────────────
CONTENT CREATION TOOLS (Use individually on request):
───────────────────────────────────────
John owns two YouTube channels:
1. GRACE NOTE INSPIRATIONS (@gracenoteinspirations) - Christian faith, prayer, Bible verses. Shorts. Voice: Erika (wIQlXk1pwcszdjmUYKyP). Baserow channel="gracenote"
2. THE GIGAWERX CHANNEL (@gigawerx) - AI tools, gig economy, freelancing. Shorts. Voice: John Pro (2EsgRiyQL1INfP0QD8HP). Baserow channel="gigawerx"

Available tools - call INDIVIDUALLY on request only, do NOT auto-chain into a pipeline:
- baserow_content: Manage content rows in Baserow table 642827
- youtube_script_generator: Write channel scripts
- youtube_analytics: Pull live stats
- comfyui_generate: Thumbnails (needs desktop + ComfyUI on)
- elevenlabs_audio mode=voiceover: Narration audio
- video_assemble: Combine image + audio into MP4 (needs Flask compiler on desktop)
- r2_upload: Upload to Cloudflare R2
- youtube_upload: Upload MP4 to YouTube

Baserow status values: new -> script_ready -> fact_ok -> seo_ready -> rendering -> rendered -> error
CRITICAL: After baserow_content create, extract the returned rowId for ALL subsequent updates.

───
MEMORY INSTRUCTIONS:
───────────────────────────────────────
- You have a 3-tier memory system:
  1. Transcript: The last ~20 messages are automatically provided below.
  2. Facts: Hard facts from the user are provided below. To save new facts or update them, use upsert_user_fact.
  3. Semantic: For abstract concepts, ideas, or overarching summaries, use save_semantic_memory and search_semantic_memory.`;

async function buildSystemPrompt(): Promise<string> {
    const facts = await getAllFacts();
    const transcript = await getTranscript(20);

    let prompt = BASE_SYSTEM_PROMPT;

    if (facts.length > 0) {
        const factLines = facts.map((f) => `- [${f.entity}] ${f.attribute}: ${f.value}`).join("\n");
        prompt += `\n\nCORE FACTS (Always True):\n${factLines}`;
    }

    if (transcript.length > 0) {
        const transcriptLines = transcript.map((m) => `[${m.role}] ${m.content}`).join("\n\n");
        prompt += `\n\nRECENT TRANSCRIPT:\n${transcriptLines}`;
    }

    return prompt;
}

// ─── Free model rotation for 429 fallback ───────────────
// Only models confirmed to support function/tool calling via OpenRouter
const FREE_MODEL_ROTATION = [
    // Fallback order when primary model hits rate limit (429)
    "stepfun/step-3.5-flash:free",                  // Flash — fast default
    "moonshotai/kimi-k2:free",                      // Kimi — best free tool-calling
    "google/gemini-2.0-flash-thinking-exp:free",    // Gemini — reasoning fallback
    "meta-llama/llama-3.3-70b-instruct:free",       // Llama — reliable general
    "deepseek/deepseek-r1:free",                    // DeepSeek — deep reasoning
];

// ─── Chat ────────────────────────────────────────────────

export async function chat(
    messages: ChatMessage[],
    tools: Tool[]
): Promise<OpenAI.ChatCompletion> {
    const openAiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
        type: "function" as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
        },
    }));

    const systemPrompt = await buildSystemPrompt();
    const builtMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages,
    ];

    // Build ordered list: active model first, then free rotation fallbacks
    const primary = getActiveModel();
    const modelsToTry = [
        primary.modelId,
        ...FREE_MODEL_ROTATION.filter(m => m !== primary.modelId),
    ];

    let lastError: Error | null = null;

    for (const modelId of modelsToTry) {
        try {
            console.log(`  🧠 Trying model: ${modelId}`);
            const result = await client.chat.completions.create({
                model: modelId,
                max_tokens: config.llmMaxTokens,
                messages: builtMessages,
                tools: openAiTools.length > 0 ? openAiTools : undefined,
            });
            // Skip models that return empty/missing choices
            if (!result.choices || result.choices.length === 0) {
                console.warn(`  ⚠️ Model ${modelId} returned empty choices, rotating...`);
                lastError = new Error(`Model ${modelId} returned no choices`);
                continue;
            }
            return result;
        } catch (err: any) {
            const status = err?.status ?? err?.response?.status;
            if (status === 429 || status === 451) {
                console.warn(`  ⚠️ Model ${modelId} rate-limited (${status}), rotating...`);
                lastError = err;
                await new Promise(r => setTimeout(r, 500)); // brief pause
                continue;
            }
            throw err; // Non-rate-limit errors bubble up immediately
        }
    }

    throw lastError ?? new Error("All models exhausted — rate limited across all free providers.");
}

