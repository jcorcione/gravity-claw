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

    // We fetch fewer transcript messages for sub-agents to avoid context poisoning
    const transcriptLimit = agent === "MANAGER" ? 20 : 10;
    const transcript = await getTranscript(transcriptLimit);

    let prompt = getAgentPromptString(agent);

    try {
        const statePath = path.join(process.cwd(), "system_state.md");
        const stateContent = await fs.readFile(statePath, "utf-8");
        if (stateContent.trim()) {
            prompt += `\n\n───────────────────────────────────────\nACTIVE SYSTEM STATE (Highest Priority Context):\n───────────────────────────────────────\n${stateContent}`;
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

// ─── Free model rotation for 429 fallback ───────────────
const FREE_MODEL_ROTATION = [
    "stepfun/step-3.5-flash:free",                  // Flash — fast default
    "moonshotai/kimi-k2:free",                      // Kimi — best free tool-calling
    "google/gemini-2.0-flash-thinking-exp:free",    // Gemini — reasoning fallback
    "meta-llama/llama-3.3-70b-instruct:free",       // Llama — reliable general
    "deepseek/deepseek-r1:free",                    // DeepSeek — deep reasoning
];

// ─── Router Logic ─────────────────────────────────────────

export async function routeUserIntent(userMessage: string): Promise<AgentName> {
    const routingPrompt = `Analyze the user's message and pick ONE domain expert to handle it.
Respond with EXACTLY one of these words in raw text (no reasoning, no markdown):
- MANAGER (Basic greeting, simple memory fact updates)
- VIDEO_CONTENT (YouTube, video generation, elevenlabs, thumbnails, scripts)
- COMM (Scanning emails, drafting recruiter emails, managing google calendar)
- SEO_BLOG (Writing blog posts, SEO analysis, browsing the web for research)
- APP_FACTORY (Brainstorming apps, scraping reddit for pain points)
- LEAD_GEN (Hunting for B2B leads or freelance PM roles)
- ADMIN (Running shell scripts, reading local files)

User Message: "${userMessage}"`;

    try {
        const result = await client.chat.completions.create({
            model: "stepfun/step-3.5-flash:free", // extremely fast & cheap routing
            messages: [{ role: "user", content: routingPrompt }],
            max_tokens: 10,
            temperature: 0.1
        });

        const text = result.choices[0]?.message?.content?.trim().toUpperCase() || "MANAGER";
        if (["MANAGER", "VIDEO_CONTENT", "COMM", "SEO_BLOG", "APP_FACTORY", "LEAD_GEN", "ADMIN"].includes(text)) {
            return text as AgentName;
        }
    } catch (e) {
        console.error("Router error, falling back to MANAGER", e);
    }
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
    const modelsToTry = [
        primary.modelId,
        ...FREE_MODEL_ROTATION.filter(m => m !== primary.modelId),
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
            if (status === 429 || status === 451) {
                console.warn(`  ⚠️ Model ${modelId} rate-limited (${status}), rotating...`);
                lastError = err;
                await new Promise(r => setTimeout(r, 500));
                continue;
            }
            throw err;
        }
    }

    throw lastError ?? new Error("All models exhausted — rate limited across all free providers.");
}
