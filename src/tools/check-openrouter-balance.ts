import { config } from "../config.js";
import type { Tool } from "./index.js";

// ─── Tool ────────────────────────────────────────────────

export const checkOpenRouterBalanceTool: Tool = {
    name: "check_openrouter_balance",
    description:
        "Fetches the remaining credit balance for the OpenRouter API account. Use this to monitor usage and alert the user if funds are running low (e.g. under $5.00).",
    inputSchema: {
        type: "object",
        properties: {
            dummy: {
                type: "boolean",
                description: "Not used"
            }
        },
    },
    execute: async () => {
        if (!config.openRouterApiKey) {
            return "Error: OPENROUTER_API_KEY is not configured.";
        }

        try {
            const response = await fetch("https://openrouter.ai/api/v1/credits", {
                headers: {
                    Authorization: `Bearer ${config.openRouterApiKey}`,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                return `Error fetching balance from OpenRouter (HTTP ${response.status}): ${errorText}`;
            }

            const data = (await response.json()) as any;

            if (!data || !data.data) {
                return "Failed to parse OpenRouter API response.";
            }

            const total = parseFloat(data.data.total_credits);
            const used = parseFloat(data.data.total_usage);
            const remaining = total - used;

            let result = `OpenRouter Credit Balance:\n- Total: $${total.toFixed(2)}\n- Used: $${used.toFixed(2)}\n- Remaining: $${remaining.toFixed(2)}\n`;

            if (remaining < 5.0) {
                result += `\n⚠️ WARNING: Balance is dangerously low (under $5.00). Please alert the user to refill their account to avoid service interruption!`;
            } else if (remaining < 10.0) {
                result += `\nℹ️ Note: Balance is getting low (under $10.00).`;
            } else {
                result += `\n✅ Balance is healthy.`;
            }

            return result;
        } catch (err: any) {
            return `Failed to fetch balance: ${err.message}`;
        }
    },
};
