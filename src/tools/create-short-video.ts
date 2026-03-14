/**
 * create-short-video.ts
 * 
 * MACRO TOOL: AgenticHQ generates the script + image prompts, then delegates
 * the ENTIRE local content pipeline to N8N via webhook.
 * 
 * Local pipeline (all on desktop, orchestrated by N8N):
 *   N8N Webhook → Kokoro TTS (port 8880) + ComfyUI (port 8188) → Flask Compiler (port 5055) → MP4
 * 
 * AgenticHQ's only job: generate script text + image prompts, then POST to N8N.
 */

import { youtubeScriptGeneratorTool } from "./youtube-script-generator.js";
import { supabaseContentTool } from "./supabase-content.js";
import type { Tool } from "./index.js";
import fetch from "node-fetch";

// Channel → Kokoro voice mapping (matches local Kokoro voices)
const CHANNEL_VOICES: Record<string, string> = {
    gracenote: "af_sarah",   // Soft, warm female voice for faith content
    gigawerx: "am_adam",     // Confident male voice for tech content
};

export const createShortVideoTool: Tool = {
    name: "create_short_video",
    description: `A macro tool that creates a YouTube Short end-to-end.
    
AgenticHQ generates the script and image prompts, then delegates the FULL local pipeline 
to the N8N video-generator webhook running on the user's desktop. 

N8N handles everything locally:
1. Kokoro TTS (localhost:8880) — generates voiceover audio
2. ComfyUI (localhost:8188) — generates thumbnail image via RTX 3060 Ti
3. Flask Compiler (localhost:5055) — assembles final MP4 with effects and subtitles

Returns the assembled MP4 path.`,
    inputSchema: {
        type: "object",
        properties: {
            channel: {
                type: "string",
                enum: ["gracenote", "gigawerx"],
                description: "Which channel: 'gracenote' (Christian faith Shorts) or 'gigawerx' (tech/AI Shorts)"
            },
            topic: {
                type: "string",
                description: "The topic, Bible verse, or idea for the video."
            },
            target_duration: {
                type: "string",
                enum: ["15s", "30s", "45s", "60s"],
                description: "Target Shorts length. Default '30s'."
            },
            script_text: {
                type: "string",
                description: "Optional. Pre-written script. If provided skips LLM script generation."
            },
            image_prompt: {
                type: "string",
                description: "Optional. Pre-written ComfyUI image prompt. If provided skips LLM prompt generation."
            }
        },
        required: ["channel", "topic"]
    },
    execute: async (input: Record<string, unknown>) => {
        const channel = String(input.channel || "gracenote");
        const topic = String(input.topic);
        const manualScript = input.script_text ? String(input.script_text) : undefined;
        const manualImagePrompt = input.image_prompt ? String(input.image_prompt) : undefined;

        const N8N_HOST = process.env.N8N_HOST || "https://desktop-4ekcfdi.tail787c77.ts.net/n8n";
        const voice = CHANNEL_VOICES[channel] || "am_adam";

        console.log(`[create_short_video] Channel: ${channel}, Topic: "${topic.substring(0, 40)}..."`);

        // ─── STEP 1: Generate Script + Image Prompt ───────────────────────────
        let finalScript = manualScript || "";
        let finalImagePrompts: string[] = manualImagePrompt ? [manualImagePrompt] : [];

        if (!finalScript || finalImagePrompts.length === 0) {
            console.log(`[Macro - 1/2] Generating script via LLM...`);
            const scriptResultStr = await youtubeScriptGeneratorTool.execute({
                channel,
                topic,
                target_duration: input.target_duration || "30s"
            });

            let scriptData: any;
            try {
                scriptData = JSON.parse(scriptResultStr);
            } catch {
                return `Pipeline failed at Step 1 (Script Generation). Raw output: ${scriptResultStr}`;
            }

            if (!scriptData?.scriptForReading || !scriptData?.thumbnailConcept) {
                return `Pipeline failed at Step 1: Script missing required fields (scriptForReading, thumbnailConcept).`;
            }

            if (!finalScript) finalScript = scriptData.scriptForReading;
            if (finalImagePrompts.length === 0) finalImagePrompts = [scriptData.thumbnailConcept];
        }

        // ─── STEP 2: POST to N8N Webhook → Full Local Pipeline ───────────────
        console.log(`[Macro - 2/2] Sending to N8N local pipeline...`);
        console.log(`  Script (${finalScript.length} chars) → Kokoro voice: ${voice}`);
        console.log(`  Image prompt: ${finalImagePrompts[0]?.substring(0, 60)}...`);

        const webhookUrl = `${N8N_HOST}/webhook/video-generator`;
        const payload = {
            script: finalScript,
            voice: voice,
            image_prompts: finalImagePrompts,
            channel: channel,
            topic: topic
        };

        let assemblyResult: any;
        try {
            const res = await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                // @ts-ignore
                signal: AbortSignal.timeout(600_000) // 10 min — ComfyUI can be slow
            });

            if (!res.ok) {
                const errText = await res.text();
                return `Pipeline failed: N8N webhook returned ${res.status}. Details: ${errText}`;
            }

            assemblyResult = await res.json();
        } catch (e: any) {
            return `Pipeline failed: Could not reach N8N webhook at ${webhookUrl}.\nMake sure N8N is running and Tailscale Funnel is active.\nError: ${e.message}`;
        }

        const outputFile = assemblyResult?.output_file || assemblyResult?.data?.[0]?.output_file || "Unknown path";

        // ─── STEP 3: Log to Supabase ──────────────────────────────────────────
        try {
            await supabaseContentTool.execute({
                action: "create",
                channel,
                topic,
                title: topic,
                script: finalScript,
                description: "",
                hashtags: "",
                video_filepath: outputFile,
                status: "rendered"
            });
        } catch (e: any) {
            console.log(`[Macro] WARNING: Supabase log failed: ${e.message}`);
        }

        // ─── STEP 4: Telegram Notification ────────────────────────────────────
        const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.ALLOWED_USER_IDS?.split(",")[0]?.trim();
        if (telegramToken && chatId) {
            try {
                await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: `🎬 *AgenticHQ — Video Complete!*\n\n*Channel:* ${channel}\n*Topic:* ${topic}\n*File:* \`${outputFile}\``,
                        parse_mode: "Markdown"
                    })
                });
            } catch { /* non-fatal */ }
        }

        return `✅ PIPELINE COMPLETE!\n\nScript:\n${finalScript}\n\nAssembly Result:\n${JSON.stringify(assemblyResult, null, 2)}\n\nOutput file: ${outputFile}`;
    }
};
