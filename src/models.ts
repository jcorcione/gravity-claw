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
    // ── Free Models ────────────────────────────────────────────────────────────
    { alias: "Nemotron", modelId: "nvidia/nemotron-3-super-120b-a12b:free", free: true, description: "Multi-token prediction, AI agents, high efficiency; top free pick" },
    { alias: "Qwen3Next", modelId: "qwen/qwen3-next-80b-a3b-instruct:free", free: true, description: "Optimized for RAG, tool use, agentic tasks" },
    { alias: "GptOss", modelId: "openai/gpt-oss-120b:free", free: true, description: "Configurable reasoning depth, native tools/function calling" },
    { alias: "Trinity", modelId: "arcee-ai/trinity-large-preview:free", free: true, description: "Strong function calling, multi-step workflows, reasoning" },
    { alias: "Devstral", modelId: "mistralai/pixtral-large-2411:free", free: true, description: "Agentic coding, multi-file orchestration" },
    { alias: "Auto", modelId: "openrouter/auto", free: true, description: "OpenRouter smart router" },

    // ── Paid Models (escalation only) ──────────────────────────────────────────
    { alias: "Haiku", modelId: "anthropic/claude-3-haiku", free: false, description: "Fast Claude — light paid tier" },
    { alias: "Sonnet", modelId: "anthropic/claude-3.5-sonnet", free: false, description: "Claude Sonnet — escalation target for complex tasks" },
    { alias: "DeepSeek", modelId: "deepseek/deepseek-chat-v3.1", free: false, description: "DeepSeek paid tier" },
    { alias: "Codex-5.2", modelId: "openai/gpt-4o", free: false, description: "GPT-4o — advanced coding + reasoning" },
    { alias: "Codex-Mini", modelId: "openai/gpt-4o-mini", free: false, description: "GPT-4o Mini — fast, cheap paid option" },
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
    ?? aliasMap.get("nemotron")   // Default: Nemotron (fast, free, stable top pick)
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
    // Use Nemotron/GptOss as free escalation target — prominent tool-calling
    return aliasMap.get("gptoss") ?? aliasMap.get("nemotron") ?? models.find(m => !m.free) ?? models[0];
}

export function resetToDefaultModel(): void {
    activeModel =
        models.find((m) => m.modelId === config.llmModel)
        ?? aliasMap.get(config.llmModel.toLowerCase())
        ?? aliasMap.get("nemotron")   // Default: Nemotron
        ?? models[0];
}
