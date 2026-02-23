import { VercelRequest, VercelResponse } from "@vercel/node";
import { getCalendarEvents } from "../src/calendar.js";
import { getAllUsers, initMemory } from "../src/memory-pg.js";
import { initMcpServers, getMcpTools } from "../src/mcp.js";

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
        console.log("[Smart Recs] Gathering data for all users...");
        await initMemory();
        await initMcpServers();
        const tools = getMcpTools();
        const searchTool = tools.find(t => t.name === "mcp_gmail_gmail_list_messages");

        const users = await getAllUsers();

        let successCount = 0;

        for (const user of users) {
            console.log(`[Smart Recs] Processing for user ${user.id} (${user.email})...`);

            // If this is not the primary user, skip sending a telegram message.
            if (user.id !== PRIMARY_CHAT_ID) {
                continue;
            }

            try {
                // 1. Get Calendar (next 7 days)
                const allEvents = await getCalendarEvents(new Date(), 10, user.id);
                let calendarContext = allEvents.length > 0
                    ? allEvents.map(e => `- ${e.startTime}: ${e.summary}`).join("\n")
                    : "No upcoming events scheduled.";

                // 2. Emails via MCP
                let unreadCount = 0;
                if (searchTool) {
                    try {
                        const context = { userId: user.id };
                        const searchResultRaw = await searchTool.execute({ q: "is:unread in:inbox", max_results: 10 }, context);
                        const messages = typeof searchResultRaw === "string" ? JSON.parse(searchResultRaw) : searchResultRaw;
                        unreadCount = messages?.length || 0;
                    } catch (e) {
                        console.log("[Smart Recs] Failed to fetch emails via MCP", e);
                    }
                }
                const emailContext = `You have ${unreadCount} unread emails.`;

                // 3. Generate Recommendations via LLM
                const prompt = `
You are Jarvis, a proactive AI assistant.
Based on the following current state of the user "${user.name || "User"}"'s data, suggest 1-2 highly actionable, proactive things you can do for them right now. 

**Upcoming Calendar:**
${calendarContext}

**Email Status:**
${emailContext}

Draft a short, polite Telegram message to the user offering these suggestions. Make it so they just have to reply "Yes" or "Do it" for you to execute them. Keep it brief and natural!
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
                const recText = llmData.choices?.[0]?.message?.content || "No recommendations at this time.";

                await sendTelegram(`💡 **Proactive Suggestion:**\n\n${recText}`, user.id);

                successCount++;
            } catch (err: any) {
                console.error(`[Smart Recs] Error processing user ${user.id}:`, err.message);
                if (user.id === PRIMARY_CHAT_ID) {
                    await sendTelegram(`❌ **Smart Rec Error:** ${err.message}`, user.id);
                }
            }
        }

        console.log(`[Smart Recs] Successfully sent to ${successCount} users.`);
        return res.status(200).json({ ok: true, message: `Recommendations sent to ${successCount} users` });

    } catch (err: any) {
        console.error("[Smart Recs] Fatal Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
}
