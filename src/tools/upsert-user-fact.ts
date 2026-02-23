import type { Tool } from "./index.js";
import { upsertFact } from "../memory-pg.js";

export const upsertUserFactTool: Tool = {
    name: "upsert_user_fact",
    description:
        "Creates or updates a factual claim about the user, system, or environment. Use this to permanently record hard facts (e.g. user preferences, rules, roles). This overwrites previous entries for the exact same entity and attribute, preventing duplicate memory entries.",
    inputSchema: {
        type: "object" as const,
        properties: {
            entity: {
                type: "string",
                description: "The core subject of the fact. Usually 'User' or 'System', but could be a concrete noun like 'Project Alpha'.",
            },
            attribute: {
                type: "string",
                description: "The property of the entity being defined (e.g. 'Favorite Food', 'Default Model', 'Wife\\'s Name').",
            },
            value: {
                type: "string",
                description: "The value of the attribute (e.g. 'Pizza', 'Flash', 'Sarah').",
            },
        },
        required: ["entity", "attribute", "value"],
    },
    execute: async (input, context) => {
        const entity = input.entity as string;
        const attribute = input.attribute as string;
        const value = input.value as string;
        const userId = context?.userId || "default_user";

        try {
            await upsertFact(entity, attribute, value, userId);
            return `Fact implicitly saved and committed to system memory: [${entity}]'s [${attribute}] is [${value}].`;
        } catch (error) {
            console.error("Error upserting fact:", error);
            return `Failed to record fact: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
};
