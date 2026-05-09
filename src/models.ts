// ─── Model Registry ──────────────────────────────────────
// Maps friendly alias → OpenRouter model ID
// Note: OpenRouter API model IDs do NOT include the "openrouter/" prefix.
//       e.g., "anthropic/claude-3.5-sonnet" NOT "openrouter/anthropic/..."

import { config } from "./config.js";

export interface ModelEntry {
    alias: string;
    modelId: string;
    free: boolean;
    description?: string;
}

const models: ModelEntry[] = [
    // ── Free Models (ranked by agentic capability — live from openrouter.ai/models?q=free on 2026-05-09) ──
    { alias: "Auto",         modelId: "openrouter/auto:free",                            free: true, description: "OpenRouter smart free router — picks best available dynamically" },
    { alias: "Nemotron",     modelId: "nvidia/nemotron-3-super-120b-a12b:free",          free: true, description: "576B MoE, 262K ctx — #1 ranked Agentic + Tool Use" },
    { alias: "Laguna",       modelId: "poolside/laguna-m.1:free",                        free: true, description: "205B, 131K ctx — Agentic Coding, Tool Use" },
    { alias: "GptOss",       modelId: "openai/gpt-oss-120b:free",                        free: true, description: "145B, 131K ctx — Agentic, Tool Use" },
    { alias: "Glm45Air",     modelId: "z-ai/glm-4.5-air:free",                          free: true, description: "79.2B, 131K ctx — Agent-centric, Thinking Mode, Tool Use" },
    { alias: "MiniMax",      modelId: "minimax/minimax-m2.5:free",                       free: true, description: "53.3B, 1M ctx — Real-world productivity, Tool Use" },
    { alias: "NemotronNano", modelId: "nvidia/nemotron-3-nano-30b-a3b:free",             free: true, description: "39B, 256K ctx — Multi-agent, Tool Use" },
    { alias: "GptOss20b",    modelId: "openai/gpt-oss-20b:free",                         free: true, description: "32.2B, 131K ctx — Agentic, Tool Use" },
    { alias: "Gemma4",       modelId: "google/gemma-4-31b-it:free",                      free: true, description: "16.9B, 262K ctx — Multimodal, Thinking Mode, Tool Use" },
    { alias: "Qwen3Coder",   modelId: "qwen/qwen3-coder:free",                           free: true, description: "480B A35B MoE, 262K ctx — Agentic Coding, Tool Use" },
    { alias: "Qwen3Next",    modelId: "qwen/qwen3-next-80b-a3b-instruct:free",           free: true, description: "80B, 262K ctx — Agentic Workflows, Tool Use" },
    { alias: "Llama70b",     modelId: "meta-llama/llama-3.3-70b-instruct:free",          free: true, description: "70B, 66K ctx — solid general fallback" },

    // ── Paid Models (escalation only) ──────────────────────────────────────────
    { alias: "Haiku",        modelId: "anthropic/claude-3-haiku",                        free: false, description: "Fast Claude — light paid tier" },
    { alias: "Sonnet",       modelId: "anthropic/claude-3.5-sonnet",                     free: false, description: "Claude Sonnet — escalation target for complex tasks" },
    { alias: "DeepSeek",     modelId: "deepseek/deepseek-chat-v3.1",                     free: false, description: "DeepSeek paid tier" },
    { alias: "Codex-5.2",    modelId: "openai/gpt-4o",                                   free: false, description: "GPT-4o — advanced coding + reasoning" },
    { alias: "Codex-Mini",   modelId: "openai/gpt-4o-mini",                              free: false, description: "GPT-4o Mini — fast, cheap paid option" },
];

// Lookup map (case-insensitive alias → entry)
const aliasMap = new Map<string, ModelEntry>(
    models.map((m) => [m.alias.toLowerCase(), m])
);

// ─── Active Model State ──────────────────────────────────
// Priority: LLM_MODEL env var (by ID) → then by alias → then Flash default
let activeModel: ModelEntry =
    models.find((m) => m.modelId === config.llmModel)
    ?? aliasMap.get(config.llmModel.toLowerCase())
    ?? aliasMap.get("auto")    // Default: openrouter/auto (smart free router)
    ?? models[0];

export function getActiveModel(): ModelEntry {
    return activeModel;
}

export function setActiveModel(alias: string): ModelEntry | null {
    const entry = aliasMap.get(alias.toLowerCase());
    if (!entry) return null;
    activeModel = entry;
    return entry;
}

export function getAllModels(): ModelEntry[] {
    return models;
}

export function formatModelList(): string {
    const free = models.filter(m => m.free);
    const paid = models.filter(m => !m.free);

    const fmt = (m: ModelEntry) => {
        const marker = m.alias === activeModel.alias ? "→ " : "  ";
        return `${marker}*${m.alias}* — ${m.description ?? ""}\n${marker}  \`${m.modelId}\``;
    };

    return `🆓 *Free Models:*\n${free.map(fmt).join("\n")}\n\n💳 *Paid (escalation only):*\n${paid.map(fmt).join("\n")}`;
}

export function getFallbackSmarterModel(): ModelEntry {
    // Use openrouter/auto as free escalation target — smart routing picks the best available
    return aliasMap.get("auto") ?? aliasMap.get("gptoss") ?? models.find(m => !m.free) ?? models[0];
}

export function resetToDefaultModel(): void {
    activeModel =
        models.find((m) => m.modelId === config.llmModel)
        ?? aliasMap.get(config.llmModel.toLowerCase())
        ?? aliasMap.get("auto")    // Default: openrouter/auto
        ?? models[0];
}
