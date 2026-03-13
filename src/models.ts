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
    { alias: "Auto", modelId: "openrouter/auto", free: true, description: "OpenRouter smart router — picks best available model" },
    { alias: "Coder", modelId: "qwen/qwen-3-coder-480b-a35b:free", free: true, description: "Preferred for all code tasks" },
    { alias: "Flash", modelId: "google/gemini-flash-1.5", free: true, description: "Default — fast, non-reasoning, excellent tool-calling, no step limit" },
    { alias: "Gemini", modelId: "google/gemini-2.5-flash-preview", free: true, description: "Strong reasoning fallback" },
    { alias: "Genius", modelId: "deepseek/deepseek-r1-0528:free", free: true, description: "Deep reasoning tasks" },
    { alias: "GLM", modelId: "z-ai/glm-4.5-air:free", free: true, description: "Agent-centric, thinking + non-thinking modes" },
    { alias: "GPT", modelId: "openai/gpt-oss-120b:free", free: true, description: "OpenAI open-weight, high reasoning" },
    { alias: "Kimi", modelId: "moonshotai/kimi-k2:free", free: true, description: "Best free agentic tool-calling (300+ sequential calls) — use for escalation" },
    { alias: "Llama", modelId: "meta-llama/llama-3.3-70b-instruct:free", free: true, description: "Reliable general-purpose fallback" },
    { alias: "Trinity", modelId: "arcee-ai/trinity-large-preview:free", free: true, description: "Best for creative writing, scripts, chat" },

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
    ?? aliasMap.get("flash")   // Default: Flash (fast, free, stable)
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
    // Use kimi-k2 as free escalation target — best agentic tool-calling on free tier
    return aliasMap.get("kimi") ?? aliasMap.get("sonnet") ?? models.find(m => !m.free) ?? models[0];
}

export function resetToDefaultModel(): void {
    activeModel =
        models.find((m) => m.modelId === config.llmModel)
        ?? aliasMap.get(config.llmModel.toLowerCase())
        ?? aliasMap.get("flash")   // Default: Flash
        ?? models[0];
}
