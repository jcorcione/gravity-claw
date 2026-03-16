import { saveScriptToSupabaseTool } from "./src/tools/save-script-to-supabase.js";

async function test() {
    console.log("Testing Supabase save tool...");
    const result = await saveScriptToSupabaseTool.execute({
        topic: "Agentic Video Pipelines",
        title: "How to Automate YouTube",
        description: "A quick test video #automation",
        hook: "Have you ever wanted to automate YouTube?",
        main_script: "It is easier than you think. Just use AgenticHQ and N8N.",
        cta: "Subscribe for more tutorials!",
        duration: "30 Seconds"
    });
    console.log(result);
}

test().catch(console.error);
