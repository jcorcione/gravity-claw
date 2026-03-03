// ─── Model Registry ──────────────────────────────────────
// Maps friendly alias → OpenRouter model ID

export interface ModelEntry {
    alias: string;
    modelId: string;
    free: boolean;
}

const models: ModelEntry[] = [
    { alias: "Auto", modelId: "openrouter/auto", free: true },
    { alias: "Flash", modelId: "stepfun/step-3.5-flash:free", free: true },
    { alias: "Gemini", modelId: "google/gemini-2.0-flash-thinking-exp:free", free: true },
    { alias: "Genius", modelId: "deepseek/deepseek-r1-0528:free", free: true },
    { alias: "GLM", modelId: "z-ai/glm-4.5-air:free", free: true },
    { alias: "GPT", modelId: "openai/gpt-oss-120b:free", free: true },
    { alias: "Llama", modelId: "meta-llama/llama-3.3-70b-instruct:free", free: true },
    { alias: "Coder", modelId: "qwen/qwen-3-coder-480b-a35b:free", free: true },
    { alias: "Trinity", modelId: "arcee-ai/trinity-large-preview:free", free: true },
    { alias: "Haiku", modelId: "anthropic/claude-3.5-haiku", free: false },
    { alias: "Sonnet", modelId: "anthropic/claude-3.5-sonnet", free: false },
    { alias: "DeepSeek", modelId: "deepseek/deepseek-chat-v3.1", free: false },
];

import { config } from "./config.js";

// Lookup map (case-insensitive)
const aliasMap = new Map<string, ModelEntry>(
    models.map((m) => [m.alias.toLowerCase(), m])
);

// ─── Active Model State ──────────────────────────────────

let activeModel: ModelEntry = models.find((m) => m.modelId === config.llmModel)
    ?? aliasMap.get(config.llmModel.toLowerCase())
    ?? aliasMap.get("llama")  // Free default fallback
    ?? models.find(m => m.free)
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
    return models
        .map((m) => {
            const marker = m.alias === activeModel.alias ? "→ " : "  ";
            const freeTag = m.free ? " 🆓" : "";
            return `${marker}*${m.alias}*${freeTag}\n${marker}  \`${m.modelId}\``;
        })
        .join("\n");
}

export function getFallbackSmarterModel(): ModelEntry {
    // Escalation order: Gemini → Genius (DeepSeek R1) → Sonnet (paid)
    return aliasMap.get("gemini")
        ?? aliasMap.get("genius")
        ?? aliasMap.get("sonnet")
        ?? models.find(m => !m.free)
        ?? models[0];
}

export function resetToDefaultModel(): void {
    activeModel = models.find((m) => m.modelId === config.llmModel)
        ?? aliasMap.get(config.llmModel.toLowerCase())
        ?? aliasMap.get("llama")
        ?? models.find(m => m.free)
        ?? models[0];
}
