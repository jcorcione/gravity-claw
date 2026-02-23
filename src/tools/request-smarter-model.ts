import type { Tool } from "./index.js";
import { EscalationError } from "../errors.js";

export const requestSmarterModelTool: Tool = {
    name: "request_smarter_model",
    description:
        "If you are a fast/free model and you determine this request is too complex for you (e.g. deep reasoning, complex coding, or architectural design), call this tool. The system will immediately abort your current thought process, escalate to a premium smarter model (like Claude 3.5 Sonnet), and have it handle the request instead.",
    inputSchema: {
        type: "object" as const,
        properties: {
            reason: {
                type: "string",
                description: "Why you are requesting a smarter model (e.g., 'Requires complex structural refactoring').",
            },
        },
        required: ["reason"],
    },
    execute: async (input) => {
        const reason = (input.reason as string) || "Task deemed too complex.";
        // Throw an escalation error that the agent loop will catch
        throw new EscalationError(reason);
    },
};
