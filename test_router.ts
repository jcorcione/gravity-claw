import { config as loadEnv } from "dotenv";
loadEnv();

import OpenAI from "openai";

const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
});

async function run() {
    const models = [
        "google/gemini-2.0-flash-lite-preview-02-05:free",
        "google/gemini-2.0-pro-exp-02-05:free",
        "google/gemini-2.0-flash-thinking-exp:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "deepseek/deepseek-r1:free",
        "mistralai/mistral-small-24b-instruct-2501:free"
    ];

    const routingPrompt = `Analyze the user's message and pick ONE domain expert to handle it.
Respond with EXACTLY one of these words in raw text (no reasoning, no markdown):
- MANAGER
- VIDEO_CONTENT
- COMM
- SEO_BLOG
- APP_FACTORY
- LEAD_GEN
- ADMIN

User Message: "run an seo analysis on https://turboplumbingtampa.com"`;

    for (const model of models) {
        try {
            console.log(`Trying ${model}...`);
            const result = await client.chat.completions.create({
                model,
                messages: [{ role: "user", content: routingPrompt }],
                max_tokens: 10,
                temperature: 0.1
            });
            console.log(`Success with ${model}! Response: ${result.choices[0]?.message?.content}`);
            break;
        } catch (e: any) {
            console.error(`Failed ${model}: ${e.message}`);
        }
    }
}
run();
