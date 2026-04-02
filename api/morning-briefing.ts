import { VercelRequest, VercelResponse } from "@vercel/node";
import { getCalendarEvents } from "../src/calendar.js";
import { initMcpServers, getMcpTools } from "../src/mcp.js";
import { getAllUsers, initMemory } from "../src/memory-pg.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const PRIMARY_CHAT_ID = process.env.ALLOWED_USER_IDS?.split(",")[0];

async function sendTelegram(message: string, chatId: string): Promise<void> {
    if (!BOT_TOKEN || !chatId) return;
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "Markdown" }),
    });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        console.log("[Morning Briefing] Gathering data for all users...");
        await initMemory();
        await initMcpServers();
        const tools = getMcpTools();
        const searchTool = tools.find(t => t.name.includes("mcp_gmail_gmail") || t.name.includes("mcp_gmail"));
        const tavilyTool = tools.find(t => t.name.includes("mcp_tavily"));

        const users = await getAllUsers();

        let successCount = 0;

        for (const user of users) {
            console.log(`[Morning Briefing] Processing for user ${user.id} (${user.email})...`);

            // If this is the primary user who has Telegram set up, send there. Otherwise, skip notification since we don't have email sending configured yet.
            // Wait, the primary user is the only one with Telegram. The other family members will just see it when they log into the web UI, or we could just skip the cron loop for them if they aren't on Telegram.
            // For now we will only send the Telegram message if the userId is the Primary chatId.
            if (user.id !== PRIMARY_CHAT_ID) {
                continue;
            }

            try {
                // 1. Get Today's Calendar
                const startOfDay = new Date();
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date();
                endOfDay.setHours(23, 59, 59, 999);

                const allEvents = await getCalendarEvents(startOfDay, 20, user.id);
                const todaysEvents = allEvents.filter(e => {
                    const date = new Date(e.startTime);
                    return date >= startOfDay && date <= endOfDay;
                });

                let calendarContext = todaysEvents.length > 0
                    ? todaysEvents.map(e => `- ${e.startTime}: ${e.summary}`).join("\n")
                    : "No events scheduled today.";

                // 2. Quick News / Weather via web search
                let newsContext = "Unable to fetch news.";
                if (tavilyTool) {
                    try {
                        const resRaw = await tavilyTool.execute({ query: "top technology and AI news today" });
                        newsContext = typeof resRaw === "string" ? resRaw.substring(0, 1000) : JSON.stringify(resRaw).substring(0, 1000);
                    } catch (e) {
                        console.log("[Morning Briefing] Failed to fetch news via MCP", e);
                    }
                }

                // 3. Unread Emails via MCP
                let unreadCount = 0;
                if (searchTool) {
                    try {
                        const context = { userId: user.id };
                        const searchResultRaw = await searchTool.execute({ q: "is:unread in:inbox", max_results: 10 }, context);
                        const messages = typeof searchResultRaw === "string" ? JSON.parse(searchResultRaw) : searchResultRaw;
                        unreadCount = messages?.length || 0;
                    } catch (e) {
                        console.log("[Morning Briefing] Failed to fetch emails via MCP", e);
                    }
                }

                // 4. Generate Briefing via LLM
                const prompt = `
Generate a friendly, concise morning briefing for the user "${user.name || "User"}".
Use the following data:

1. **Calendar Today:**
${calendarContext}

2. **Top News:**
${newsContext}

3. **Emails:**
${unreadCount} unread emails in the inbox.

Write it natively in Markdown format for Telegram. Keep it highly actionable, upbeat, and short. Do not expose raw JSON or internal IDs. Just a beautiful morning summary.
`;

                const groqApiUrl = "https://api.groq.com/openai/v1/chat/completions";
                const llmRes = await fetch(groqApiUrl, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: [{ role: "user", content: prompt }]
                    })
                });

                const llmData = await llmRes.json();
                const briefingText = llmData.choices?.[0]?.message?.content || "Failed to generate briefing content.";

                await sendTelegram(`🌅 **Good Morning!**\n\n${briefingText}`, user.id);
                successCount++;
            } catch (err: any) {
                console.error(`[Morning Briefing] Error processing user ${user.id}:`, err.message);
                if (user.id === PRIMARY_CHAT_ID) {
                    await sendTelegram(`❌ **Morning Briefing Error:** ${err.message}`, user.id);
                }
            }
        }

        console.log(`[Morning Briefing] Successfully sent to ${successCount} users.`);
        return res.status(200).json({ ok: true, message: `Briefings sent to ${successCount} users.` });

    } catch (err: any) {
        console.error("[Morning Briefing] Fatal Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
}
