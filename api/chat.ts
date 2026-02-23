import { VercelRequest, VercelResponse } from "@vercel/node";
import { runAgentLoop } from "../src/agent.js";
import { initMemory } from "../src/memory-pg.js";
import { initPinecone } from "../src/pinecone.js";
import { initMcpServers } from "../src/mcp.js";

// Global initialization flag to prevent reconnecting on every request
let isInitialized = false;

async function ensureInitialized() {
    if (isInitialized) return;

    console.log("Initializing Vercel Serverless Backend...");
    await initMemory();

    try {
        await initPinecone();
    } catch {
        // Pinecone handles its own errors gracefully in the init block
    }

    try { await initMcpServers(); } catch (e) { console.warn("MCP init failed (non-fatal on serverless):", e); }
    isInitialized = true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        await ensureInitialized();

        const { message, userId } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized: Missing user ID" });
        }

        const resolvedUserId = userId; // In a true production app, we would verify a JWT here. For personal use, we trust the localStorage ID.

        console.log(`[Web UI] Received message from ${resolvedUserId}: ${message}`);

        // --- Streaming SSE Setup ---
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.flushHeaders();

        const sendEvent = (data: object) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Run the full agent loop (tool calls + LLM) and get the final text
        sendEvent({ type: "status", text: "⚡ Thinking..." });
        const fullResponse = await runAgentLoop(message, resolvedUserId);

        // Stream the response word-by-word for a smooth feel
        const words = fullResponse.split(/(\s+)/);
        for (const word of words) {
            sendEvent({ type: "token", text: word });
            await new Promise(r => setTimeout(r, 8));
        }

        sendEvent({ type: "done" });
        res.end();

    } catch (error: any) {
        console.error("Vercel Function Error:", error);
        try {
            res.write(`data: ${JSON.stringify({ type: "error", text: error?.message || "Unknown error" })}\n\n`);
            res.end();
        } catch {
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
}
