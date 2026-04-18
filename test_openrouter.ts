import * as dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";

const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: { "X-Title": "AgenticHQ" }
});

const models = [
    "openai/gpt-4o-mini",
    "google/gemma-4-31b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free"
];

for (const model of models) {
    try {
        const r = await client.chat.completions.create({
            model,
            messages: [{ role: "user", content: "Say OK" }],
            max_tokens: 5
        });
        console.log(`✅ ${model}: ${r.choices[0]?.message?.content}`);
    } catch (e: any) {
        console.log(`❌ ${model}: ${e.status} — ${e.message}`);
    }
}
