import OpenAI from "openai";
import { config } from "../config.js";
import type { Tool } from "./index.js";
import fs from "fs/promises";
import path from "path";

const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: config.openRouterApiKey,
    defaultHeaders: {
        "X-Title": "AgenticHQ",
    },
});

export const humanizeTextTool: Tool = {
    name: "humanize_text",
    description: "Rewrites a given text to remove AI-sounding vocabulary, robotic formatting, and corporate jargon to make it sound authentically human. Uses the blader/humanizer skill.",
    inputSchema: {
        type: "object",
        properties: {
            text: {
                type: "string",
                description: "The AI-generated text to humanize."
            }
        },
        required: ["text"]
    },
    execute: async (input: Record<string, unknown>) => {
        const textToRewrite = input.text as string;
        if (!textToRewrite) return "Error: No text provided.";

        try {
            // Load the locally cloned Humanizer SKILL.md
            const skillPath = path.join(process.cwd(), "~", ".claude", "skills", "humanizer", "SKILL.md");
            let systemInstruction = "";
            try {
                systemInstruction = await fs.readFile(skillPath, "utf-8");
            } catch (err) {
                console.warn("Could not find local SKILL.md, using fallback prompt.");
                systemInstruction = "You are a writing editor. Strip all AI jargon (like 'moreover', 'delve', 'crucial', 'tapestry') and rewrite the given text to sound casual, opinionated, and authentically human. Remove all emojis and corporate conclusions.";
            }

            console.log("  🧠 Running text through Humanizer LLM Pass...");

            const result = await client.chat.completions.create({
                model: "moonshotai/kimi-k2:free", // Strong open free model for writing tasks
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: `Please strictly humanize the following text according to your system rules:\n\n${textToRewrite}` }
                ],
                max_tokens: 2000,
                temperature: 0.7
            });

            return result.choices[0]?.message?.content || "Failed to generate humanized text.";
        } catch (e: any) {
            return `Humanizer Error: ${e.message}`;
        }
    }
};
