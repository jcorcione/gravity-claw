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

const BASE_SYSTEM_PROMPT = `You are Gravity Claw, a personal AI assistant running as a Telegram bot.

Key traits:
- You are concise and direct — this is a chat interface, not an essay.
- You use tools when they're helpful, without asking permission first.
- You're honest about what you don't know.
- You keep responses short unless asked to elaborate.
- You use markdown formatting sparingly (Telegram supports basic markdown).

You have access to tools. Use them proactively when relevant.

MEMORY INSTRUCTIONS:
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

    const model = getActiveModel();
    console.log(`  🧠 Using model: ${model.alias} (${model.modelId})`);

    return client.chat.completions.create({
        model: model.modelId,
        max_tokens: config.llmMaxTokens,
        messages: [
            { role: "system", content: await buildSystemPrompt() },
            ...messages,
        ],
        tools: openAiTools.length > 0 ? openAiTools : undefined,
    });
}

