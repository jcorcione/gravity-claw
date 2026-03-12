import type { Tool } from "./index.js";

export const n8nWebhookTool: Tool = {
    name: "n8n_webhook",
    description: "Triggers a local or remote n8n webhook to delegate a complex workflow. Allows Jarvis/AgentHQ to act as the 'brain' and pass structured data to n8n.",
    inputSchema: {
        type: "object",
        properties: {
            endpoint: {
                type: "string",
                description: "The webhook endpoint path (e.g. '/webhook/video-generator' or 'video-generator')"
            },
            payload: {
                type: "object",
                description: "A JSON object containing the data to send to the webhook (e.g. topic, script, scene descriptions, etc.)",
                additionalProperties: true
            },
            wait_for_response: {
                type: "boolean",
                description: "If true, the tool will wait for the n8n workflow to complete and return its response. If false, it fires and forgets."
            }
        },
        required: ["endpoint", "payload"]
    },
    execute: async (input: Record<string, unknown>) => {
        const endpoint = String(input.endpoint).startsWith('/') ? String(input.endpoint) : `/${String(input.endpoint)}`;
        const payload = input.payload as Record<string, any>;
        const wait_for_response = Boolean(input.wait_for_response);

        // Allow overriding the n8n host via environment variables (vital for Tailscale/Railway)
        const N8N_HOST = process.env.N8N_HOST || "http://localhost:5678";

        // Handle cases where the endpoint might accidentally include the /webhook prefix twice, etc.
        let finalPath = endpoint;
        if (!finalPath.startsWith('/webhook/')) {
            finalPath = `/webhook${finalPath}`;
        }

        const webhook_url = `${N8N_HOST}${finalPath}`;

        try {
            console.log(`[n8n Webhook] Triggering ${webhook_url}...`);

            const fetchPromise = fetch(webhook_url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!wait_for_response) {
                // Fire and forget, don't await the response body
                fetchPromise.catch(e => console.error("[n8n Webhook] Async error:", e));
                return "Webhook triggered asynchronously. Did not wait for n8n response.";
            }

            const response = await fetchPromise;

            if (!response.ok) {
                return `Webhook failed with status: ${response.status} ${response.statusText}`;
            }

            const text = await response.text();
            try {
                // Try to parse as JSON if possible
                const json = JSON.parse(text);
                return JSON.stringify(json, null, 2);
            } catch {
                return text; // Return raw text if not JSON
            }

        } catch (error: any) {
            return `Error triggering n8n webhook: ${error.message}`;
        }
    },
};
