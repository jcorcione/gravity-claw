import type { Tool } from "./index.js";
import { generateEmbedding } from "../embeddings.js";
import { searchPinecone } from "../pinecone.js";

export const searchSemanticMemoryTool: Tool = {
    name: "search_semantic_memory",
    description:
        "Searches long-term semantic memory for abstract concepts, ideas, or past conversations that match a narrative description. It uses vector similarity, so you don't need exact keywords.",
    inputSchema: {
        type: "object" as const,
        properties: {
            query: {
                type: "string",
                description: "The natural language query describing what you are trying to remember.",
            },
            limit: {
                type: "number",
                description: "Max number of matches to return (default 5).",
            },
        },
        required: ["query"],
    },
    execute: async (input, context) => {
        const query = String(input.query);
        const limit = typeof input.limit === "number" ? input.limit : 5;
        const userId = context?.userId || "default_user";

        try {
            const embedding = await generateEmbedding(query);
            const matches = await searchPinecone(embedding, limit, userId);

            if (matches.length === 0) {
                return `No semantic memories found for: "${query}"`;
            }

            const results = matches.map((m) => `- ${m.text} [${m.timestamp}]`).join("\n");
            return `🧠 Semantic Memory Search Results:\n\n${results}`;
        } catch (err) {
            console.error("Pinecone search error:", err);
            return `❌ Failed to search semantic memory.`;
        }
    },
};
