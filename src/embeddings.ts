import OpenAI from "openai";
import { config } from "./config.js";

const openai = new OpenAI({
    apiKey: config.openAiApiKey,
});

/**
 * Generate a 1536-dimensional vector embedding for the given text using OpenAI.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        encoding_format: "float",
    });

    return response.data[0]?.embedding ?? [];
}
