import { youtubeScriptGeneratorTool } from "./youtube-script-generator.js";
import { comfyuiGenerateTool } from "./comfyui-generate.js";
import { elevenlabsAudioTool } from "./elevenlabs-audio.js";
import { videoAssembleTool } from "./video-assemble.js";
import { r2UploadTool } from "./r2-upload.js";
import { supabaseContentTool } from "./supabase-content.js";
import type { Tool } from "./index.js";
import * as path from "path";
import fetch from "node-fetch";

export const createShortVideoTool: Tool = {
    name: "create_short_video",
    description: `A macro tool that executes the ENTIRE YouTube Shorts generation pipeline end-to-end bypassing Baserow.
    
    This tool will run sequentially:
    1. youtube_script_generator (Creates Script & Metadata)
    2. comfyui_generate (Creates Thumbnail on Desktop via Tailscale)
    3. elevenlabs_audio (Creates Voiceover on Desktop)
    4. video_assemble (Renders final MP4 on Desktop via Tailscale)

    Returns the path to the assembled MP4.`,
    inputSchema: {
        type: "object",
        properties: {
            channel: {
                type: "string",
                enum: ["gracenote", "gigawerx"],
                description: "Which channel to write for: 'gracenote' (spiritual) or 'gigawerx' (tech)"
            },
            topic: {
                type: "string",
                description: "The topic, pain point, or idea for the video."
            },
            target_duration: {
                type: "string",
                enum: ["30s", "45s", "60s"],
                description: "Target Shorts length. Default '45s'."
            },
            script_text: {
                type: "string",
                description: "Optional. An exact, pre-written script. If provided, skips the LLM script generation phase."
            },
            image_prompt: {
                type: "string",
                description: "Optional. An exact image generation prompt. Should be provided if script_text is provided."
            }
        },
        required: ["channel", "topic"]
    },
    execute: async (input: Record<string, unknown>) => {
        const channel = String(input.channel || "gracenote");
        const topic = String(input.topic);
        const manualScriptText = input.script_text ? String(input.script_text) : undefined;
        const manualImagePrompt = input.image_prompt ? String(input.image_prompt) : undefined;

        console.log(`[Macro] Starting end-to-end pipeline for ${channel} - "${topic.substring(0, 30)}..."`);

        // STEP 1: Generate Script
        let finalScriptText = "";
        let finalImagePrompt = "";

        if (manualScriptText && manualImagePrompt) {
            console.log(`[Macro - Step 1/4] Skipping Generation. Using provided script and image prompt.`);
            finalScriptText = manualScriptText;
            finalImagePrompt = manualImagePrompt;
        } else {
            console.log(`[Macro - Step 1/4] Generating Script...`);
            const scriptResultStr = await youtubeScriptGeneratorTool.execute({
                channel,
                topic,
                target_duration: input.target_duration || "45s"
            });

            // Parse script result to extract text and image prompts
            let scriptData: any;
            try {
                scriptData = JSON.parse(scriptResultStr);
            } catch (e) {
                return `Pipeline failed at Step 1 (Script Generation). Raw output: ${scriptResultStr}`;
            }

            if (!scriptData || !scriptData.scriptForReading || !scriptData.thumbnailConcept) {
                return `Pipeline failed at Step 1: Script output was missing critical fields (scriptForReading or thumbnailConcept).`;
            }
            finalScriptText = scriptData.scriptForReading;
            finalImagePrompt = scriptData.thumbnailConcept;
        }

        // STEP 2: Generate Thumbnail
        console.log(`[Macro - Step 2/4] Generating Thumbnail via ComfyUI...`);
        const imageResultStr = await comfyuiGenerateTool.execute({
            prompt: finalImagePrompt,
            format: "shorts_vertical",
            channel: channel === "gracenote" ? "gracenote" : "gigawerx"
        });

        let imageData: any;
        try {
            imageData = JSON.parse(imageResultStr);
        } catch (e) {
            return `Pipeline failed at Step 2 (Image Generation). Raw output: ${imageResultStr}`;
        }

        if (imageData.error || !imageData.success || !imageData.imageUrls || imageData.imageUrls.length === 0) {
            return `Pipeline failed at Step 2 (Image Generation): ${imageData.error || "No image URLs returned."}`;
        }
        const imageUrl = imageData.imageUrls[0];

        // STEP 3: Generate Voiceover
        const audioResultStr = await elevenlabsAudioTool.execute({
            text: finalScriptText,
            mode: "voiceover",
            channel: channel
        });

        // The audio tool returns raw text output that includes the local path.
        // Example output: "✅ Voiceover saved to: C:/Users/jcorc/comfyui-output/1741198642345.mp3"
        let audioPath = "";
        const audioPathMatch = audioResultStr.match(/(\w\:[\\\/].*\.mp3)/i);
        if (audioPathMatch) {
            audioPath = audioPathMatch[1].trim();
        } else {
            return `Pipeline failed at Step 3 (Voice Generation). Could not extract audio path from: ${audioResultStr}`;
        }

        // STEP 3.5: Upload Audio to R2 so Desktop can download it
        console.log(`[Macro - Step 3.5/4] Uploading audio to R2 for compiler access...`);
        const r2ResultStr = await r2UploadTool.execute({
            action: "upload",
            filePath: audioPath,
            key: `temp-voiceovers/${path.basename(audioPath)}`
        });

        let finalAudioUrl = "";
        const r2Match = r2ResultStr.match(/Public URL:\s*(https:\/\/.*\.r2\.dev\/.*)/i);
        if (r2Match) {
            finalAudioUrl = r2Match[1].trim();
            console.log(`[Macro] Audio uploaded to R2: ${finalAudioUrl}`);
        } else {
            return `Pipeline failed at Step 3.5 (R2 Upload). Raw: ${r2ResultStr}`;
        }

        // STEP 4: Assemble Video
        console.log(`[Macro - Step 4/4] Assembling final video...`);
        const outputName = `${channel}_short_${Date.now()}.mp4`;
        const assembleResultStr = await videoAssembleTool.execute({
            imagePath: imageUrl,
            audioPath: finalAudioUrl,
            outputName: outputName,
            effect: "zoom_in",
            subtitle: topic,
            dynamic_subtitles: true
        });

        // STEP 5: Log to Supabase
        console.log(`[Macro - Step 5/5] Logging video to Supabase...`);
        let finalVideoPath = "";
        const pathMatch = assembleResultStr.match(/Output:\s*(.+)/i);
        if (pathMatch) {
            finalVideoPath = pathMatch[1].trim();
        }

        try {
            const supabaseResult = await supabaseContentTool.execute({
                action: "create",
                channel: channel,
                topic: topic,
                title: topic, // using topic since manual script has no title
                script: finalScriptText,
                description: "",
                hashtags: "",
                video_filepath: finalVideoPath,
                status: "rendered"
            });
            console.log(`[Macro] Supabase Log Result:`, supabaseResult);
        } catch (e: any) {
            console.log(`[Macro] WARNING: Failed to log to Supabase: ${e.message}`);
        }

        // STEP 6: Send Telegram Notification
        const telegramToken = process.env["TELEGRAM_BOT_TOKEN"];
        const chatId = process.env["ALLOWED_USER_IDS"]; // Reusing allowed user ID as chat ID
        if (telegramToken && chatId) {
            try {
                console.log(`[Macro - Step 6/6] Sending Telegram Notification...`);
                // Split multi-user IDs if multiple are allowed, grab first one
                const mainChatId = chatId.split(",")[0].trim();
                const msg = `🎬 *Gravity Claw Video Completed!*\n\n*Channel:* ${channel}\n*Topic:* ${topic}\n*Video Path:* \`${finalVideoPath}\``;
                await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id: mainChatId,
                        text: msg,
                        parse_mode: "Markdown"
                    })
                });
            } catch (e: any) {
                console.log(`[Macro] WARNING: Failed to send Telegram notification: ${e.message}`);
            }
        }

        return `✅ MACRO PIPELINE COMPLETE!
        
Script Output: 
${finalScriptText}

Assembly Result:
${assembleResultStr}`;
    }
};
