import type { Tool } from "./index.js";
import { search } from "duck-duck-scrape";

export const searchWebTool: Tool = {
    name: "search_web",
    description: "Search the web using DuckDuckGo to find up-to-date information, news, or facts. Returns top results with titles, URLs, and text snippets.",
    inputSchema: {
        type: "object" as const,
        properties: {
            query: {
                type: "string",
                description: "The search query to look up on the web.",
            },
            maxResults: {
                type: "number",
                description: "Maximum number of results to return (default 5, max 10).",
            },
        },
        required: ["query"],
    },
    execute: async (input) => {
        const query = input.query as string;
        const maxResults = Math.min((input.maxResults as number) || 5, 10);

        try {
            const searchResults = await search(query);

            if (!searchResults.results || searchResults.results.length === 0) {
                return `No web results found for query: "${query}"`;
            }

            const results = searchResults.results.slice(0, maxResults);

            let output = `Found ${results.length} web results for "${query}":\n\n`;
            for (let i = 0; i < results.length; i++) {
                const res = results[i];
                output += `${i + 1}. **${res.title}**\n   URL: ${res.url}\n   Snippet: ${res.description}\n\n`;
            }

            return output;
        } catch (error: any) {
            return `Failed to execute web search: ${error.message}`;
        }
    },
};
