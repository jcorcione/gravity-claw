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

Key traits:
- You are concise and direct — this is a chat interface, not an essay.
- You use tools when they're helpful, without asking permission first.
- You're honest about what you don't know.
- You keep responses short unless asked to elaborate.
- You use markdown formatting sparingly (Telegram supports basic markdown).

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

───────────────────────────────────────
CONTENT PIPELINE WORKFLOW:
───────────────────────────────────────
When asked to create a video or add content, chain these tools in order:
1. baserow_content (action=create) → add idea to pipeline, set channel
2. youtube_script_generator → generate 3-part script for the right channel
3. baserow_content (action=update) → save script, title, description, hashtags → set status="script_ready"
4. comfyui_generate → generate 3 thumbnail options (channel style preset)
5. baserow_content (action=update) → save thumbnail_1/2/3 → set status="seo_ready"
6. elevenlabs_audio (mode=voiceover) → generate narration with correct voice
7. elevenlabs_audio (mode=music) → generate background music
8. baserow_content (action=update) → status="rendering"

Baserow table: 642827 (main pipeline)
Valid status values (use EXACTLY): new → script_ready → fact_ok → seo_ready → rendering → rendered → error

For quick requests (just a script, no Baserow needed), skip the Baserow steps.
For "add to pipeline" or "create a video" requests, use the full chain.
CRITICAL: After baserow_content create, read the "rowId" field from the response JSON and use that exact integer for ALL subsequent update calls. Never use row_id=1 or guess — always extract it from the create response.

───────────────────────────────────────
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
const FREE_MODEL_ROTATION = [
    "google/gemini-2.0-flash-thinking-exp:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "deepseek/deepseek-r1-0528:free",
    "openai/gpt-oss-120b:free",
    "z-ai/glm-4.5-air:free",
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

