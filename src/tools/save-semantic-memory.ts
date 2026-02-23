import type { Tool } from "./index.js";
import { generateEmbedding } from "../embeddings.js";
import { saveToPinecone } from "../pinecone.js";

export const saveSemanticMemoryTool: Tool = {
    name: "save_semantic_memory",
    description:
        "Saves an abstract concept, narrative summary, or 'vibe' to long-term semantic memory. This memory will be matched based on conceptual similarity, not exact keywords. Use this for summarizing conversations or saving ideas, rather than hard facts.",
    inputSchema: {
        type: "object" as const,
        properties: {
            text: {
                type: "string",
                description: "The full text/narrative of the memory to save. Be descriptive so it matches later queries cleanly.",
            },
        },
        required: ["text"],
    },
    execute: async (input, context) => {
        const text = String(input.text);
        const userId = context?.userId || "default_user";

        try {
            const embedding = await generateEmbedding(text);
            const id = await saveToPinecone(text, embedding, userId);
            return `✅ Saved semantic memory [${id}].`;
        } catch (err) {
            console.error("Pinecone save error:", err);
            return `❌ Failed to save semantic memory.`;
        }
    },
};
