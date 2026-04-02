import { getAllTools, type Tool } from "../tools/index.js";
import { getMcpTools } from "../mcp.js";

type AgentName = "MANAGER" | "VIDEO_CONTENT" | "COMM" | "SEO_BLOG" | "APP_FACTORY" | "LEAD_GEN" | "ADMIN";

export function getAgentTools(agent: AgentName): Tool[] {
    const allNativeTools = getAllTools();
    const allMcpTools = getMcpTools();
    const allTools = [...allNativeTools, ...allMcpTools];

    const getToolsByName = (names: string[]) => allTools.filter(t => names.includes(t.name));
    const getMcpToolsByPrefix = (prefix: string) => allTools.filter(t => t.name.startsWith(prefix));

    switch (agent) {
        case "MANAGER":
            return getToolsByName([
                "get_current_time",
                "upsert_user_fact",
                "save_semantic_memory",
                "search_semantic_memory",
                "request_smarter_model",
                "check_openrouter_balance"
            ]);

        case "VIDEO_CONTENT":
            return [
                ...getToolsByName([
                    "youtube_script_generator",
                    "youtube_analytics"
                ]),
                ...getMcpToolsByPrefix("mcp_tavily_"),
                ...getMcpToolsByPrefix("mcp_brave_"),
                ...getMcpToolsByPrefix("mcp_galaxyai_")
            ];

        case "COMM":
            return [
                ...getToolsByName([
                    "scan_recruiter_emails"
                ]),
                // ── MCP tools ONLY ──
                ...getMcpToolsByPrefix("mcp_gmail_"),
                ...getMcpToolsByPrefix("mcp_tavily_"),
                ...getMcpToolsByPrefix("mcp_brave_")
            ];

        case "SEO_BLOG":
            return [
                ...getToolsByName(["analyze_seo", "humanize_text"]),
                ...getMcpToolsByPrefix("mcp_tavily_"),
                ...getMcpToolsByPrefix("mcp_brave_"),
                ...getMcpToolsByPrefix("mcp_apify_")
            ];

        case "APP_FACTORY":
            return [
                ...getMcpToolsByPrefix("mcp_tavily_"),
                ...getMcpToolsByPrefix("mcp_brave_"),
                ...getMcpToolsByPrefix("mcp_apify_")
            ];

        case "LEAD_GEN":
            return [
                ...getMcpToolsByPrefix("mcp_tavily_"),
                ...getMcpToolsByPrefix("mcp_brave_"),
                ...getMcpToolsByPrefix("mcp_gmail_create_draft")
            ];

        case "ADMIN":
            return [
                ...getToolsByName(["run_shell"]),
                ...getMcpToolsByPrefix("mcp_filesystem_") // If an MCP filesystem is attached
            ];

        default:
            return [];
    }
}
