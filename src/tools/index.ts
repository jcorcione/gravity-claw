// ─── Tool Type ────────────────────────────────────────────

export interface Tool {
    /** Unique tool name (snake_case) */
    name: string;
    /** Human-readable description for the LLM */
    description: string;
    /** JSON Schema for the tool's input parameters */
    inputSchema: Record<string, unknown>;
    /** Execute the tool with validated input, returns result string */
    execute: (input: Record<string, unknown>, context?: { userId: string }) => Promise<string>;
}

// ─── Registry ────────────────────────────────────────────

const registry = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
    if (registry.has(tool.name)) {
        throw new Error(`Tool "${tool.name}" is already registered`);
    }
    registry.set(tool.name, tool);
    console.log(`  🔧 Registered tool: ${tool.name}`);
}

export function getAllTools(): Tool[] {
    return Array.from(registry.values());
}

export async function executeTool(
    name: string,
    input: Record<string, unknown>,
    context: { userId: string } = { userId: "default_user" }
): Promise<string> {
    const tool = registry.get(name);
    if (!tool) {
        return `Error: Unknown tool "${name}"`;
    }

    try {
        return await tool.execute(input, context);
    } catch (err) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'EscalationError') {
            throw err;
        }
        const message = err instanceof Error ? err.message : String(err);
        return `Error executing tool "${name}": ${message}`;
    }
}

// ─── Auto-Register Tools ─────────────────────────────────

import { getCurrentTimeTool } from "./get-current-time.js";
import { upsertUserFactTool } from "./upsert-user-fact.js";
import { saveSemanticMemoryTool } from "./save-semantic-memory.js";
import { searchSemanticMemoryTool } from "./search-semantic-memory.js";
import { runShellTool } from "./run-shell.js";
import { requestSmarterModelTool } from "./request-smarter-model.js";
import { scanRecruiterEmailsTool } from "./scan-recruiter-emails.js";
import { analyzeSeoTool } from "./analyze-seo.js";
import { checkOpenRouterBalanceTool } from "./check-openrouter-balance.js";
import { youtubeAnalyticsTool } from "./youtube-analytics.js";
import { youtubeScriptGeneratorTool } from "./youtube-script-generator.js";
import { elevenlabsAudioTool } from "./elevenlabs-audio.js";
import { supabaseContentTool } from "./supabase-content.js";
import { videoCompileTool } from "./video-compile.js";
import { edgeTtsTool } from "./edge-tts.js";
import { r2UploadTool } from "./r2-upload.js";
import { youtubeUploadTool } from "./youtube-upload.js";
import { videoAssembleTool } from "./video-assemble.js";
import { createShortVideoTool } from "./create-short-video.js";
import { humanizeTextTool } from "./humanize-text.js";
import { n8nWebhookTool } from "./n8n-webhook.js";
import { kokoroAudioTool } from "./kokoro-audio.js";
import { saveScriptToSupabaseTool } from "./save-script-to-supabase.js";
import { braveSearchTool } from "./brave-search.js";
import { notionSearchTool } from "./notion-search.js";

// Prevent multiple registrations if file is re-imported
if (registry.size === 0) {
    registerTool(getCurrentTimeTool);
    registerTool(upsertUserFactTool);
    registerTool(saveSemanticMemoryTool);
    registerTool(searchSemanticMemoryTool);
    registerTool(runShellTool);
    registerTool(requestSmarterModelTool);
    registerTool(scanRecruiterEmailsTool);
    registerTool(analyzeSeoTool);
    registerTool(checkOpenRouterBalanceTool);
    registerTool(youtubeAnalyticsTool);
    registerTool(youtubeScriptGeneratorTool);
    registerTool(elevenlabsAudioTool);
    registerTool(supabaseContentTool);
    registerTool(videoCompileTool);
    registerTool(edgeTtsTool);
    registerTool(r2UploadTool);
    registerTool(youtubeUploadTool);
    registerTool(videoAssembleTool);
    registerTool(createShortVideoTool);
    registerTool(humanizeTextTool);
    registerTool(n8nWebhookTool);
    registerTool(kokoroAudioTool);
    registerTool(saveScriptToSupabaseTool);
    registerTool(braveSearchTool);
    registerTool(notionSearchTool);
}
