import { config } from "dotenv";
import OpenAI from "openai";
config();

const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
});

async function run() {
    const res = await client.chat.completions.create({
        model: "stepfun/step-3.5-flash:free",
        messages: [{ role: "user", content: "Analyze the SEO of https://turboplumbingtampa.com" }],
        tools: [{
            type: "function",
            function: {
                name: "analyze_seo",
                description: "Run SEO analysis on a URL",
                parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }
            }
        }],
        tool_choice: "auto"
    });
    console.log("StepFun response:", res.choices[0]?.message);

    const resLlama = await client.chat.completions.create({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [{ role: "user", content: "Analyze the SEO of https://turboplumbingtampa.com" }],
        tools: [{
            type: "function",
            function: {
                name: "analyze_seo",
                description: "Run SEO analysis on a URL",
                parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }
            }
        }],
        tool_choice: "auto"
    });
    console.log("Llama response:", resLlama.choices[0]?.message);
}
run();
