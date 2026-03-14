import postgres from "postgres";
import type { Tool } from "./index.js";

export const saveScriptToSupabaseTool: Tool = {
    name: "save_script_to_supabase",
    description: `Saves a generated video script and its metadata to the Supabase video_pipeline table.
This is the final step in the content generation loop. Once the script is written, use this tool to save it. N8N orchestrator will automatically pick it up for rendering.`,
    inputSchema: {
        type: "object",
        properties: {
            topic: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            hook: { type: "string" },
            main_script: { type: "string" },
            cta: { type: "string" },
            generative_style: { type: "string", description: "e.g., Hyper-Realistic, Disney Pixar, Cyberpunk" },
            tts_voice: { type: "string", description: "e.g., female_01.wav, am_adam" },
            image_provider: { type: "string", description: "e.g., fal.ai or together.ai" },
            duration: { type: "string", description: "Target duration, e.g., '1 Minute'" }
        },
        required: ["topic", "title", "description", "hook", "main_script", "cta"]
    },
    execute: async (input) => {
        const dbUrl = process.env["SUPABASE_DB_URL"];
        if (!dbUrl) {
            return "Error: SUPABASE_DB_URL is not set in environment.";
        }
        
        const sql = postgres(dbUrl, { ssl: "require" });
        
        try {
            const topic = input.topic as string;
            const title = input.title as string;
            const description = input.description as string;
            const hook = input.hook as string;
            const main_script = input.main_script as string;
            const cta = input.cta as string;
            const generative_style = (input.generative_style as string) || "Hyper-Realistic";
            const tts_voice = (input.tts_voice as string) || "female_01.wav";
            const image_provider = (input.image_provider as string) || "fal.ai";
            const duration = (input.duration as string) || null;

            const newRow = await sql`
                INSERT INTO public.video_pipeline (
                    topic, title, description, hook, main_script, cta, generative_style, tts_voice, image_provider, duration, status
                ) VALUES (
                    ${topic}, ${title}, ${description}, ${hook}, ${main_script}, ${cta}, ${generative_style}, ${tts_voice}, ${image_provider}, ${duration}, 'Pending'
                ) RETURNING id;
            `;
            
            return `✅ Successfully saved video script to Supabase video_pipeline table! Data is safely queued for N8N rendering. Pipeline Row ID: ${newRow[0].id}`;
        } catch (error: any) {
            return `Error saving to Supabase: ${error.message}`;
        } finally {
            await sql.end();
        }
    }
};
