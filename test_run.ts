import * as dotenv from "dotenv";
dotenv.config();

// Override Tailscale funnel for local testing to avoid 502 Hairpinning
process.env.COMFYUI_URL = "http://127.0.0.1:8188";
process.env.COMPILER_URL = "http://127.0.0.1:5055";

async function run() {
    console.log("🚀 Starting Pipeline Test...");
    try {
        const { createShortVideoTool } = await import("./src/tools/create-short-video.js");
        const result = await createShortVideoTool.execute({
            channel: "gracenote",
            topic: "Friday Rest",
            script_text: "Another Friday. Empty. Drained. God sees your exhaustion. He didn't design you for endless doing. He made you for rest. Isaiah 58 promises: when you make rest sacred, joy returns. Your rest matters to God.",
            image_prompt: "a tired person's coffee mug on a desk in a dark room warm lighting streaming through a window, subtle cross silhouette in background, moody, no faces, professional YouTube Shorts thumbnail"
        });
        console.log("✅ Pipeline Result:");
        console.log(result);
    } catch (e: any) {
        console.error("❌ Pipeline Error:");
        console.error(e.message);
    }
}

run();
