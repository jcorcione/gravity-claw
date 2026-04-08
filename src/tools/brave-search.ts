import fetch from "node-fetch";

export const braveSearchTool = {
    name: "brave_search",
    description: "Performs a web search using the Brave Search API. Use this to find current, up-to-date information on the internet.",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "The search query."
            },
            count: {
                type: "number",
                description: "Number of search results to return (default: 5, max: 20)."
            }
        },
        required: ["query"]
    },
    execute: async (input: Record<string, unknown>) => {
        const query = String(input.query);
        const count = typeof input.count === 'number' ? input.count : 5;
        console.log(`[Tool: brave_search] Searching for: "${query}"...`);

        const apiKey = process.env.BRAVE_SEARCH_API_KEY;
        if (!apiKey) {
            return "Error: BRAVE_SEARCH_API_KEY environment variable is not set.";
        }

        try {
            const url = new URL("https://api.search.brave.com/res/v1/web/search");
            url.searchParams.set("q", query);
            url.searchParams.set("count", count.toString());

            const response = await fetch(url.toString(), {
                headers: {
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": apiKey
                }
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Brave Search API HTTP ${response.status}: ${text}`);
            }

            const data = await response.json() as any;
            
            if (!data.web || !data.web.results || data.web.results.length === 0) {
                return "No results found.";
            }

            const results = data.web.results.map((r: any, index: number) => {
                return `${index + 1}. [${r.title}](${r.url})\n   ${r.description}`;
            });

            return `Brave Search Results for "${query}":\n\n` + results.join("\n\n");
        } catch (err: any) {
            console.error(`[brave_search] Search failed:`, err);
            return `Error performing Brave search: ${err.message}`;
        }
    }
};
