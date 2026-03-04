import { execSync } from "child_process";
import type { Tool } from "./index.js";

// Predefined task configurations
const TASKS: Record<string, { url: string; description: string; query?: string }> = {
    jcorcione_scan: {
        url: "https://jcorcione.com",
        description: "Scan John Corcione's lifestyle tech website for latest posts and articles",
    },
    wired_scan: {
        url: "https://www.wired.com/tag/artificial-intelligence/",
        description: "Scan Wired.com for the latest AI news headlines",
    },
    google_trends_gigawerx: {
        url: "https://trends.google.com/trending?geo=US&category=5",  // Tech category
        description: "Scan Google Trends for trending AI/tech topics relevant to Gigawerx",
    },
    google_trends_faith: {
        url: "https://trends.google.com/trending?geo=US&category=0",
        description: "Scan Google Trends for trending topics relevant to Grace Note Inspirations",
        query: "faith prayer inspiration",
    },
};

function runAgentBrowser(args: string, timeoutMs = 30000): string {
    try {
        const cmd = `npx agent-browser ${args} --json`;
        const result = execSync(cmd, {
            timeout: timeoutMs,
            env: {
                ...process.env,
                PLAYWRIGHT_BROWSERS_PATH: process.env["PLAYWRIGHT_BROWSERS_PATH"] ?? "/root/.cache/ms-playwright",
            },
        });
        return result.toString("utf8");
    } catch (err: any) {
        const output = err.stdout?.toString() ?? err.stderr?.toString() ?? err.message;
        return JSON.stringify({ success: false, error: output.slice(0, 500) });
    }
}

function parseHeadlines(snapshot: string, maxItems = 5): string[] {
    // Extract lines that look like headlines (longer text, capitalized)
    const lines = snapshot
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 30 && l.length < 200)
        .filter(l => /^[A-Z]/.test(l))
        .filter(l => !l.startsWith("http"))
        .slice(0, maxItems);
    return lines;
}

export const browserAgentTool: Tool = {
    name: "browser_agent",
    description: `Browse the web using a headless Chromium browser to scrape content that APIs can't reach.
Use this for:
- task="jcorcione_scan": Scan https://jcorcione.com for John's latest lifestyle tech posts
- task="wired_scan": Get latest AI news headlines from Wired.com
- task="google_trends_gigawerx": Scrape Google Trends for hot AI/tech topics (for Gigawerx content ideas)
- task="google_trends_faith": Scrape Google Trends for faith/inspiration topics (for Grace Note content ideas)
- task="custom": Browse any URL with custom instructions

Returns extracted text content and headlines from the page.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            task: {
                type: "string",
                enum: ["jcorcione_scan", "wired_scan", "google_trends_gigawerx", "google_trends_faith", "custom"],
                description: "The predefined task to run, or 'custom' to provide a URL directly",
            },
            url: {
                type: "string",
                description: "URL to visit (only required for task='custom')",
            },
            instructions: {
                type: "string",
                description: "What specific content to look for on the page (optional)",
            },
        },
        required: ["task"],
    },
    execute: async (input) => {
        const task = input.task as string;
        const customUrl = input.url as string | undefined;
        const instructions = input.instructions as string | undefined;

        let targetUrl: string;
        let taskDescription: string;

        if (task === "custom") {
            if (!customUrl) return "Error: 'url' is required for custom tasks.";
            targetUrl = customUrl;
            taskDescription = instructions ?? "Extract the main content and headlines from this page.";
        } else {
            const config = TASKS[task];
            if (!config) return `Error: Unknown task '${task}'.`;
            targetUrl = config.url;
            taskDescription = instructions ?? config.description;
        }

        console.log(`  🌐 Browser Agent: Opening ${targetUrl}`);

        // Step 1: Navigate to the URL
        const openResult = runAgentBrowser(`open "${targetUrl}" --wait-for-load`);
        let openData: any;
        try { openData = JSON.parse(openResult); } catch { openData = {}; }
        if (openData.success === false) {
            return `Browser failed to open ${targetUrl}: ${openData.error ?? openResult.slice(0, 200)}`;
        }

        // Step 2: Take a snapshot of the visible content
        const snapshotResult = runAgentBrowser("snapshot");
        let snapshot = "";
        try {
            const snapshotData = JSON.parse(snapshotResult);
            snapshot = snapshotData.data?.snapshot ?? snapshotResult;
        } catch {
            snapshot = snapshotResult;
        }

        // Step 3: Extract meaningful content
        const headlines = parseHeadlines(snapshot);

        let summary = `📄 **${targetUrl}**\n\n`;
        summary += `*Task: ${taskDescription}*\n\n`;

        if (headlines.length > 0) {
            summary += `**Top content found:**\n`;
            headlines.forEach((h, i) => { summary += `${i + 1}. ${h}\n`; });
        } else {
            // Fallback: return first 800 chars of snapshot text
            const cleanText = snapshot
                .replace(/\[.*?\]/g, "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 800);
            summary += `**Page content:**\n${cleanText}`;
        }

        return summary;
    },
};
