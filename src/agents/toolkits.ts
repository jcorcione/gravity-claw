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
            return getToolsByName([
                // ── N8N Pipeline (the ONLY video creation path) ──────────────
                "save_script_to_sheets",    // POSTs to N8N webhook → AllTalk + ComfyUI + Flask

                // ── Script & Research ─────────────────────────────────────────
                "youtube_script_generator", // Generates script + thumbnail prompt
                "search_web",               // Trend research for content calendar
                "youtube_analytics",        // Channel performance lookup

                // ── Legacy / Reference Only ───────────────────────────────────
                // create_short_video, elevenlabs_audio, comfyui_generate,
                // video_assemble, video_compile are DISABLED — they bypass N8N
                // and try to run the pipeline directly from Railway, which fails
                // because ComfyUI/AllTalk/Flask only run on the local desktop.
            ]);

        case "COMM":
            return [
                ...getToolsByName(["scan_recruiter_emails", "search_calendar", "manage_calendar", "search_web"]),
                ...getMcpToolsByPrefix("mcp_gmail_"),
                ...getMcpToolsByPrefix("mcp_tavily_")
            ];

        case "SEO_BLOG":
            return [
                ...getToolsByName(["search_web", "analyze_seo", "browser_agent", "humanize_text"]),
                ...getMcpToolsByPrefix("mcp_tavily_")
            ];

        case "APP_FACTORY":
            return [
                ...getToolsByName(["reddit_scraper", "search_web"]),
                ...getMcpToolsByPrefix("mcp_tavily_")
            ];

        case "LEAD_GEN":
            return [
                ...getToolsByName(["search_web"]),
                ...getMcpToolsByPrefix("mcp_gmail_create_draft") // Only draft access
            ];

        case "ADMIN":
            return getToolsByName([
                "run_shell",
                "read_file",
                "write_file",
                "list_directory"
            ]);

        default:
            return [];
    }
}
