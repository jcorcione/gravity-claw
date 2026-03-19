import OpenAI from "openai";
import { config } from "./config.js";
import { getActiveModel } from "./models.js";
import { getAllFacts, getTranscript } from "./memory-pg.js";
import type { Tool } from "./tools/index.js";
import fs from "fs/promises";
import path from "path";
import {
    MANAGER_PROMPT,
    VIDEO_AGENT_PROMPT,
    COMM_AGENT_PROMPT,
    SEO_BLOG_AGENT_PROMPT,
    APP_FACTORY_AGENT_PROMPT,
    LEAD_GEN_AGENT_PROMPT,
    ADMIN_AGENT_PROMPT
} from "./agents/prompts.js";

// ─── Types ───────────────────────────────────────────────

export type ChatMessage = OpenAI.ChatCompletionMessageParam;
export type AgentName = "MANAGER" | "VIDEO_CONTENT" | "COMM" | "SEO_BLOG" | "APP_FACTORY" | "LEAD_GEN" | "ADMIN";

// ─── Client ──────────────────────────────────────────────

const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: config.openRouterApiKey,
    defaultHeaders: {
        "X-Title": "AgenticHQ",
        "HTTP-Referer": "https://gravity-claw-production-d161.up.railway.app",
    },
});

function getAgentPromptString(agent: AgentName): string {
    switch (agent) {
        case "VIDEO_CONTENT": return VIDEO_AGENT_PROMPT;
        case "COMM": return COMM_AGENT_PROMPT;
        case "SEO_BLOG": return SEO_BLOG_AGENT_PROMPT;
        case "APP_FACTORY": return APP_FACTORY_AGENT_PROMPT;
        case "LEAD_GEN": return LEAD_GEN_AGENT_PROMPT;
        case "ADMIN": return ADMIN_AGENT_PROMPT;
        case "MANAGER":
        default: return MANAGER_PROMPT;
    }
}

async function buildSystemPrompt(agent: AgentName): Promise<string> {
    const facts = await getAllFacts();

    // MANAGER gets 50 messages for rich history; sub-agents get 40.
    // 15 was too small as it was easily exhausted by tool call 'noise' (Assistant (Tool Call) + Tool result).
    const transcriptLimit = agent === "MANAGER" ? 50 : 40;
    const transcript = await getTranscript(transcriptLimit);

    let prompt = getAgentPromptString(agent);

    // Provide the agents with absolute temporal awareness
    const now = new Date();
    const currentDateString = now.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
    const currentTimeString = now.toLocaleTimeString("en-US", { timeZone: 'America/New_York' });
    prompt += `\n\n[SYSTEM CONTEXT]\nCurrent Date: ${currentDateString}\nCurrent Time (EST/EDT): ${currentTimeString}\n`;

    try {
        const statePath = path.join(process.cwd(), "system_state.md");
        const stateContent = await fs.readFile(statePath, "utf-8");
        if (stateContent.trim()) {
            prompt += `\n───────────────────────────────────────\nACTIVE SYSTEM STATE (Highest Priority Context):\n───────────────────────────────────────\n${stateContent}`;
        }
    } catch {
        // Silently skip if system_state.md does not exist
    }

    if (facts.length > 0) {
        const factLines = facts.map((f) => `- [${f.entity}] ${f.attribute}: ${f.value}`).join("\n");
        prompt += `\n\nCORE FACTS (Always True):\n${factLines}`;
    }

    if (transcript.length > 0) {
        let transcriptLines = "";
        // If it's a sub-agent, don't confuse it with previous tool calls from irrelevant domains.
        // Just show the raw conversation flow.
        const filteredTranscript = transcript.filter(m => {
            if (agent !== "MANAGER" && m.role === "tool") return false;
            // Also filter out the "(Tool Call)" dummy messages we save in agent.ts
            // These eat up the 40-message window without providing content.
            if (m.role === "assistant" && m.content === "(Tool Call)") return false;
            return true;
        });

        transcriptLines = filteredTranscript.map((m) => {
            if (m.role === "tool") return `[tool output: ${m.content?.substring(0, 100)}...]`;
            return `[${m.role}] ${m.content}`;
        }).join("\n\n");

        prompt += `\n\nRECENT TRANSCRIPT:\n${transcriptLines}`;
    }

    return prompt;
}

// ─── Model Rotation ─────────────────────────────────────
// Pull free fallback models dynamically from the registry so models.ts is the
// single source of truth. Hardcoded stale model IDs were causing daily 400/404s.
import { getAllModels } from "./models.js";

function getFreeRotation(): string[] {
    const freeModels = getAllModels()
        .filter(m => m.free && m.modelId !== "openrouter/auto")
        .map(m => m.modelId);
    // Always end with a reliable paid fallback
    return [...freeModels, "openai/gpt-4o-mini", "anthropic/claude-3-haiku"];
}

// Router needs fast, precise instruction followers.
// Use 70B models for routing logic to ensure complex intents are caught.
const ROUTER_MODEL_ROTATION = [
    "meta-llama/llama-3.3-70b-instruct:free",       // FREE — Very precise routing
    "google/gemma-3-27b-it:free",                   // FREE — Fast fallback
    "anthropic/claude-3.5-sonnet",                  // PAID — Bulletproof routing/memory
    "openai/gpt-4o-mini",                           // PAID — Fast, cheap fallback
];

// ─── Router Logic ─────────────────────────────────────────

export async function routeUserIntent(userMessage: string): Promise<AgentName> {
    // ─── Fast Regex Slash Command Bypass ─────────────────────
    const lowerMessage = userMessage.trim().toLowerCase();
    if (lowerMessage.startsWith("/video")) return "VIDEO_CONTENT";
    if (lowerMessage.startsWith("/comm")) return "COMM";
    if (lowerMessage.startsWith("/seo")) return "SEO_BLOG";
    if (lowerMessage.startsWith("/app")) return "APP_FACTORY";
    if (lowerMessage.startsWith("/lead")) return "LEAD_GEN";
    if (lowerMessage.startsWith("/admin")) return "ADMIN";
    if (lowerMessage.startsWith("/manager")) return "MANAGER";

    const routingPrompt = `Analyze the user's message and pick ONE domain expert to handle it.
Respond with EXACTLY one of these words in raw text (no reasoning, no markdown):
- MANAGER (Basic greeting, simple memory fact updates)
- VIDEO_CONTENT (YouTube, video generation, elevenlabs, thumbnails, scripts)
- COMM (Scanning emails, drafting recruiter emails, managing google calendar, executing the daily morning intelligence briefing)
- SEO_BLOG (Writing blog posts, SEO analysis, browsing the web for research)
- APP_FACTORY (Brainstorming apps, scraping reddit for pain points)
- LEAD_GEN (Hunting for B2B leads or freelance PM roles)
- ADMIN (Running shell scripts, reading local files)

Current Date: ${new Date().toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' })}

User Message: "${userMessage}"`;

    for (const modelId of ROUTER_MODEL_ROTATION) {
        try {
            const result = await client.chat.completions.create({
                model: modelId,
                messages: [{ role: "user", content: routingPrompt }],
                max_tokens: 10,
                temperature: 0.1
            });

            const text = result.choices[0]?.message?.content?.toUpperCase() || "MANAGER";
            console.log(`[Router Debug] ${modelId} returned: ${text}`);

            if (text.includes("VIDEO_CONTENT")) return "VIDEO_CONTENT";
            if (text.includes("COMM")) return "COMM";
            if (text.includes("SEO_BLOG")) return "SEO_BLOG";
            if (text.includes("APP_FACTORY")) return "APP_FACTORY";
            if (text.includes("LEAD_GEN")) return "LEAD_GEN";
            if (text.includes("ADMIN")) return "ADMIN";

            if (text.includes("MANAGER")) return "MANAGER";

            // If the model outputs nonsense, it's safer to loop to the next model
            console.warn(`Router ${modelId} output unrecognized text, trying next...`);
        } catch (e: any) {
            const status = e?.status ?? e?.response?.status;
            if (status === 429 || status === 451 || status === 404 || status === 400 || status === 502) {
                console.warn(`  ⚠️ Router Model ${modelId} failed (${status}), rotating...`);
                continue;
            }
            console.error(`Router error on ${modelId}`, e.message);
        }
    }

    console.warn("All router models failed, defaulting to MANAGER");
    return "MANAGER";
}

// ─── Chat ────────────────────────────────────────────────

export async function chat(
    messages: ChatMessage[],
    tools: Tool[],
    agent: AgentName = "MANAGER"
): Promise<OpenAI.ChatCompletion> {
    const openAiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
        type: "function" as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
        },
    }));

    const systemPrompt = await buildSystemPrompt(agent);
    const builtMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages,
    ];

    const primary = getActiveModel();
    const rotation = getFreeRotation();
    const modelsToTry = [
        primary.modelId,
        ...rotation.filter(m => m !== primary.modelId),
    ];

    let lastError: Error | null = null;

    for (const modelId of modelsToTry) {
        try {
            console.log(`  🧠 Trying model: ${modelId} for Agent: ${agent}`);
            const result = await client.chat.completions.create({
                model: modelId,
                max_tokens: config.llmMaxTokens,
                messages: builtMessages,
                tools: openAiTools.length > 0 ? openAiTools : undefined,
            });
            if (!result.choices || result.choices.length === 0) {
                lastError = new Error(`Model ${modelId} returned no choices`);
                continue;
            }
            return result;
        } catch (err: any) {
            const status = err?.status ?? err?.response?.status;
            if (status === 429 || status === 451 || status === 404 || status === 400 || status === 502) {
                // Log the actual error body so we can see WHY it rejected (not just the status code)
                const detail = err?.error?.message ?? err?.message ?? "(no detail)";
                console.warn(`  ⚠️ Model ${modelId} failed (${status}): ${detail}`);
                lastError = err;
                await new Promise(r => setTimeout(r, 500));
                continue;
            }
            throw err;
        }
    }

    throw lastError ?? new Error("All models exhausted — rate limited across all free providers.");
}
