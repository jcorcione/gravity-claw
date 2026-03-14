import { saveScriptToSheetsTool } from "./src/tools/save-script-to-sheets.js";

async function test() {
    console.log("Testing Google Sheets save tool...");
    const result = await saveScriptToSheetsTool.execute({
        items: [
            {
                channel: "gigawerx",
                topic: "Agentic Google Sheets",
                title: "How to Automate N8N",
                hook: "Have you ever wanted to automate YouTube?",
                main_script: "It is easier than you think. Just use AgenticHQ and N8N.",
                cta: "Subscribe for more tutorials!",
                thumbnail_prompt: "A futuristic robot writing numbers on a glowing green spreadsheet."
            }
        ]
    });
    console.log(result);
}

test().catch(console.error);
