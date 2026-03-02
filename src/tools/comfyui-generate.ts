import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

// Your desktop's ComfyUI via Tailscale Funnel
const COMFYUI_URL = process.env.COMFYUI_URL || "https://desktop-4ekcfdi.tail787c77.ts.net";

// Available models on your machine
const MODELS = {
    thumbnail: "realvisxlV50_v50LightningBakedvae.safetensors", // Fast SDXL — best for thumbnails
    realistic: "Realistic_Vision_V5.1_fp16-no-ema.safetensors",  // SD1.5 photorealism
};

// ─── Build a simple txt2img workflow for ComfyUI API ─────────────────────────
function buildThumbnailWorkflow(
    prompt: string,
    negativePrompt: string,
    width: number,
    height: number,
    model: string,
    steps: number = 6, // Lightning = fewer steps needed
): Record<string, unknown> {
    return {
        "4": {
            "inputs": { "ckpt_name": model },
            "class_type": "CheckpointLoaderSimple",
            "_meta": { "title": "Load Checkpoint" }
        },
        "6": {
            "inputs": {
                "text": prompt,
                "clip": ["4", 1]
            },
            "class_type": "CLIPTextEncode",
            "_meta": { "title": "Positive Prompt" }
        },
        "7": {
            "inputs": {
                "text": negativePrompt,
                "clip": ["4", 1]
            },
            "class_type": "CLIPTextEncode",
            "_meta": { "title": "Negative Prompt" }
        },
        "8": {
            "inputs": {
                "samples": ["10", 0],
                "vae": ["4", 2]
            },
            "class_type": "VAEDecode",
            "_meta": { "title": "VAE Decode" }
        },
        "9": {
            "inputs": {
                "filename_prefix": "gravity-claw-thumb",
                "images": ["8", 0]
            },
            "class_type": "SaveImage",
            "_meta": { "title": "Save Image" }
        },
        "10": {
            "inputs": {
                "seed": Math.floor(Math.random() * 9999999999),
                "steps": steps,
                "cfg": 1.5,
                "sampler_name": "dpmpp_sde",
                "scheduler": "karras",
                "denoise": 1.0,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["11", 0]
            },
            "class_type": "KSampler",
            "_meta": { "title": "KSampler" }
        },
        "11": {
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": 1
            },
            "class_type": "EmptyLatentImage",
            "_meta": { "title": "Empty Latent Image" }
        }
    };
}

// ─── Poll ComfyUI until job completes ─────────────────────────────────────────
async function waitForCompletion(promptId: string, timeoutMs = 120000): Promise<string[]> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await new Promise(r => setTimeout(r, 2000));
        const res = await fetch(`${COMFYUI_URL}/history/${promptId}`);
        const history = await res.json() as any;

        if (history[promptId]) {
            const outputs = history[promptId].outputs as any;
            const images: string[] = [];
            for (const nodeId of Object.keys(outputs)) {
                const nodeOutput = outputs[nodeId];
                if (nodeOutput.images) {
                    for (const img of nodeOutput.images) {
                        images.push(`${COMFYUI_URL}/view?filename=${img.filename}&subfolder=${img.subfolder || ""}&type=${img.type || "output"}`);
                    }
                }
            }
            return images;
        }
    }
    throw new Error("ComfyUI job timed out after 2 minutes.");
}

export const comfyuiGenerateTool = {
    name: "comfyui_generate",
    description: `Generates an image using the local ComfyUI instance (RTX 3060 Ti, SDXL) connected via Tailscale.
    Use this to create: YouTube thumbnails (1280x720), Shorts thumbnails (1080x1920), or square social media images.
    Optimized for faceless content — no faces generated. Uses realvisxlV50 Lightning for fast photorealistic results.
    Returns a direct URL to the generated image.`,
    inputSchema: {
        type: "object",
        properties: {
            prompt: {
                type: "string",
                description: "Detailed image generation prompt. Include: style, subject, colors, text overlay description, mood. Example: 'cinematic dark background, bold white text overlay saying ANXIETY IS A LIAR, glowing cross, golden light rays, professional YouTube thumbnail, no faces, 8k photorealistic'"
            },
            format: {
                type: "string",
                enum: ["youtube_thumbnail", "shorts_vertical", "square"],
                description: "Output format: 'youtube_thumbnail' = 1280x720, 'shorts_vertical' = 1080x1920, 'square' = 1080x1080. Default: 'youtube_thumbnail'"
            },
            channel: {
                type: "string",
                enum: ["gracenote", "gigawerx", "custom"],
                description: "Channel style preset: 'gracenote' = dark spiritual/faith aesthetic, warm golds. 'gigawerx' = modern tech, neon accents, dark. 'custom' = use prompt as-is."
            },
            negative_prompt: {
                type: "string",
                description: "Optional negative prompt. Defaults to removing faces, bad quality, watermarks."
            }
        },
        required: ["prompt", "channel"]
    },
    execute: async (input: Record<string, unknown>) => {
        const userPrompt = String(input.prompt || "");
        const format = String(input.format || "youtube_thumbnail");
        const channel = String(input.channel || "custom");
        const userNegative = String(input.negative_prompt || "");

        console.log(`[Tool: comfyui_generate] Generating ${format} for ${channel}: ${userPrompt.substring(0, 60)}...`);

        // Verify ComfyUI is reachable
        try {
            const ping = await fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(8000) });
            if (!ping.ok) throw new Error("ComfyUI unreachable");
        } catch {
            return JSON.stringify({
                error: "ComfyUI is not reachable. Make sure your desktop is on with ComfyUI running and Tailscale Funnel active.",
                url: COMFYUI_URL
            });
        }

        // Dimensions
        const dims: Record<string, [number, number]> = {
            youtube_thumbnail: [1280, 720],
            shorts_vertical: [1080, 1920],
            square: [1080, 1080],
        };
        const [width, height] = dims[format] || [1280, 720];

        // Channel style prefix
        const stylePrefix: Record<string, string> = {
            gracenote: "cinematic faith-inspired photography, dark moody background, warm golden glowing light, cross motif, peaceful atmosphere, no faces, professional YouTube thumbnail, 8k detailed, ",
            gigawerx: "modern tech aesthetic, dark background, vibrant neon cyan accent, holographic elements, bold typography layout, futuristic minimal design, no faces, professional YouTube thumbnail, 8k, ",
            custom: "",
        };

        const fullPrompt = (stylePrefix[channel] || "") + userPrompt;
        const negativePrompt = userNegative ||
            "faces, people, text, watermark, low quality, blurry, distorted, deformed, ugly, bad anatomy, out of frame, cropped, oversaturated";

        // Build and submit workflow
        const workflow = buildThumbnailWorkflow(fullPrompt, negativePrompt, width, height, MODELS.thumbnail);
        const clientId = uuidv4();

        const submitRes = await fetch(`${COMFYUI_URL}/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: workflow, client_id: clientId })
        });

        if (!submitRes.ok) {
            const err = await submitRes.text();
            return JSON.stringify({ error: `ComfyUI rejected the workflow: ${err}` });
        }

        const submitData = await submitRes.json() as any;
        const promptId = submitData.prompt_id;

        console.log(`[comfyui_generate] Job submitted: ${promptId}. Waiting for RTX 3060 Ti...`);

        // Wait for completion
        const imageUrls = await waitForCompletion(promptId);

        return JSON.stringify({
            success: true,
            promptId,
            imageUrls,
            format,
            dimensions: `${width}x${height}`,
            model: MODELS.thumbnail,
            viewInBrowser: imageUrls[0],
            instructions: "Image generated on your local RTX 3060 Ti. Open the URL in your browser to download it."
        }, null, 2);
    }
};
