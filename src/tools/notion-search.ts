import fetch from "node-fetch";

export const notionSearchTool = {
    name: "notion_search",
    description: "Search for pages and databases within the user's Notion workspace. This uses the Notion API to find information.",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "The term or phrase to search for in Notion."
            }
        },
        required: ["query"]
    },
    execute: async (input: Record<string, unknown>) => {
        const query = String(input.query);
        console.log(`[Tool: notion_search] Searching Notion for: "${query}"...`);

        const apiKey = process.env.NOTION_API_KEY;
        if (!apiKey) {
            return "Error: NOTION_API_KEY environment variable is not set.";
        }

        try {
            const response = await fetch("https://api.notion.com/v1/search", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    query: query,
                    page_size: 5
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Notion API HTTP ${response.status}: ${text}`);
            }

            const data = await response.json() as any;
            
            if (!data.results || data.results.length === 0) {
                return "No results found in Notion.";
            }

            const results = data.results.map((r: any, index: number) => {
                let title = "Untitled";
                // Notion schema uses various property names for titles, usually 'title' or 'Name' for databases
                if (r.properties) {
                    for (const key of Object.keys(r.properties)) {
                        if (r.properties[key].type === 'title') {
                            title = r.properties[key].title?.[0]?.plain_text || "Untitled";
                            break;
                        }
                    }
                }
                const objectType = r.object === "database" ? "Database" : "Page";
                return `${index + 1}. [${objectType}] ${title}\n   URL: ${r.url}`;
            });

            return `Notion Search Results for "${query}":\n\n` + results.join("\n\n");
        } catch (err: any) {
            console.error(`[notion_search] Search failed:`, err);
            return `Error performing Notion search: ${err.message}`;
        }
    }
};
