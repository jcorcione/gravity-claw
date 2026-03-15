import express from "express";
import cors from "cors";
import { runAgentLoop } from "./agent.js";
import dashboardRouter from "./dashboard-api.js";
import "./index.js"; // This automatically boots the Telegram bot and initializes all DB/MCP connections

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
// Express 5 strict body parser — catch malformed JSON and return clean 400
app.use((req, res, next) => {
    express.json()(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: `Invalid JSON body: ${err.message}` });
        }
        next();
    });
});

// ─── Dashboard API (Mission Control) ─────────────────────
app.use("/api/dashboard", dashboardRouter);


// ─── Health check ────────────────────────────────────────
app.get("/health", (_req, res) => {
    res.json({ ok: true, version: "dashboard-api-v1", ts: new Date().toISOString() });
});

app.post("/api/chat", async (req, res) => {
    try {
        const { message, userId } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized: Missing user ID" });
        }

        const resolvedUserId = userId;

        console.log(`[Web UI -> Railway Node] Received message from ${resolvedUserId}: ${message}`);

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

        // Since ./index.js already initializes Memory, Pinecone, and MCP,
        // we can safely just run the agent loop immediately.
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
        console.error("Express API Error:", error);
        try {
            res.write(`data: ${JSON.stringify({ type: "error", text: error?.message || "Unknown error" })}\n\n`);
            res.end();
        } catch {
            if (!res.headersSent) {
                res.status(500).json({ error: "Internal Server Error" });
            }
        }
    }
});

// ─── Global Express 5 Error Handler ─────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Express Error Handler]", err.message);
    res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🌐 API Bridge Server listening on port ${PORT}`);
    console.log(`   Web UI requests to /api/chat will be processed here.`);
    console.log(`======================================================\n`);
});
