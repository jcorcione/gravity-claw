import type { Tool } from "./index.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

export const saveScriptToSheetsTool: Tool = {
    name: "save_script_to_sheets",
    description: `Saves an array of generated video script ideas to the N8N Pipeline webhook (or locally as fallback). 
This must be the final step after drafting ideas. ALWAYS use this tool to save scripts so the orchestrator picks them up.`,
    inputSchema: {
        type: "object",
        properties: {
            items: {
                type: "array",
                description: "Array of video scripts to save.",
                items: {
                    type: "object",
                    properties: {
                        channel: { type: "string", enum: ["gracenote", "gigawerx"], description: "The channel the video is for." },
                        title: { type: "string", description: "The SEO-optimized hook/title of the video." },
                        script: { type: "string", description: "The exact spoken text. Under 20 seconds reading time." },
                        thumbnail_prompt: { type: "string", description: "Detailed image generation prompt for ComfyUI." }
                    },
                    required: ["channel", "title", "script", "thumbnail_prompt"]
                }
            }
        },
        required: ["items"]
    },
    execute: async (input) => {
        const items = input.items as any[];
        if (!Array.isArray(items)) {
            return "Error: 'items' must be an array";
        }

        const webhookUrl = process.env.N8N_WEBHOOK_URL;
        const results: any[] = [];

        if (webhookUrl) {
            for (const item of items) {
                if (!item.channel || !item.title || !item.script || !item.thumbnail_prompt) continue;
                
                try {
                    // Build the webhook payload matching N8N Extract Payload field names:
                    // $json.body.script, $json.body.channel, $json.body.image_prompts (array)
                    const webhookPayload = {
                        script: item.script,
                        channel: item.channel,
                        image_prompts: [item.thumbnail_prompt],   // N8N reads image_prompts[0] for ComfyUI
                    };
                    const response = await fetch(webhookUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ body: webhookPayload })
                    });
                    
                    if (!response.ok) {
                        results.push({ item: item.title, status: "error", code: response.status });
                    } else {
                        results.push({ item: item.title, status: "sent" });
                    }
                } catch (err: any) {
                    results.push({ item: item.title, status: "error", message: err.message });
                }
            }
            const sent = results.filter(r => r.status === "sent").length;
            const failed = results.filter(r => r.status === "error").length;
            return JSON.stringify({ status: "webhook", sent, failed, results }, null, 2);
        }

        // Fallback: write to local JSONL file
        const workspace = path.join(os.homedir(), ".openclaw", "workspace");
        const outDir = path.join(workspace, "video_scripts_output");
        
        try {
            await fs.mkdir(outDir, { recursive: true });
        } catch (err) {
            // ignore
        }
        
        const outFile = path.join(outDir, "scripts.jsonl");
        let count = 0;
        
        try {
            for (const item of items) {
                if (!item.channel || !item.title || !item.script || !item.thumbnail_prompt) continue;
                item.saved_at = new Date().toISOString() + "Z";
                await fs.appendFile(outFile, JSON.stringify(item) + "\n", "utf8");
                count++;
            }
            return JSON.stringify({ status: "ok", saved: count, file: outFile }, null, 2);
        } catch (err: any) {
            return `Error: File write failed: ${err.message}`;
        }
    }
};
