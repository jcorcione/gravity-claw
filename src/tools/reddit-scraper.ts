import type { Tool } from "./index.js";

interface RedditPost {
    title: string;
    selftext: string;
    url: string;
    score: number;
    num_comments: number;
}

export const redditScraperTool: Tool = {
    name: "reddit_scraper",
    description: "Scrape the top or 'hot' posts from a specific subreddit to research pain points, complaints, or startup ideas.",
    inputSchema: {
        type: "object",
        properties: {
            subreddit: {
                type: "string",
                description: "Name of the subreddit without the 'r/' (e.g., 'SaaS', 'Entrepreneur', 'SmallBusiness')."
            },
            limit: {
                type: "number",
                description: "Number of posts to fetch (default 10, max 50)."
            },
            category: {
                type: "string",
                description: "Category to sort by: 'hot', 'top', or 'new' (default 'hot')."
            }
        },
        required: ["subreddit"]
    },
    execute: async (input: Record<string, unknown>) => {
        const subreddit = input.subreddit as string;
        const limit = (input.limit as number) || 10;
        const category = (input.category as string) || "hot";

        if (!subreddit) return "Error: No subreddit provided.";

        try {
            console.log(`  🔍 Scraping r/${subreddit} [${category}]...`);
            const url = `https://www.reddit.com/r/${subreddit}/${category}.json?limit=${limit}`;

            const req = await fetch(url, {
                headers: {
                    'User-Agent': 'GravityClaw/1.0 (App Ideation Agent)'
                }
            });

            if (!req.ok) {
                return `Failed to fetch from Reddit: ${req.status} ${req.statusText}`;
            }

            const data = await req.json();
            const posts = data.data?.children || [];

            if (posts.length === 0) {
                return `No posts found in r/${subreddit}. Note: Requires a public subreddit.`;
            }

            const formatted = posts.map((child: any) => {
                const p: RedditPost = child.data;
                // Truncate ultra-long body text to save tokens
                const truncatedBody = p.selftext.length > 500
                    ? p.selftext.substring(0, 500) + "... [truncated]"
                    : p.selftext;

                return `Title: ${p.title}\nScore: ${p.score} | Comments: ${p.num_comments}\nURL: ${p.url}\nBody: ${truncatedBody}\n---`;
            }).join("\n\n");

            return `Scraped ${posts.length} posts from r/${subreddit}:\n\n${formatted}`;
        } catch (e: any) {
            return `Reddit Scraper Error: ${e.message}`;
        }
    }
};
