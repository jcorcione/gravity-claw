import * as dotenv from 'dotenv';
dotenv.config();

import { searchPinecone } from './src/pinecone.js';
import { generateEmbedding } from './src/embeddings.js';

async function checkPinecone() {
    console.log("Generating embedding for 'Baserow YouTube Content Pipeline'...");
    const embedding = await generateEmbedding("Baserow YouTube pipeline database");

    console.log("Searching Pinecone...");
    // Assuming 849679016 is the user ID from .env
    const matches = await searchPinecone(embedding, 10, "849679016");

    console.log(`Found ${matches.length} semantic matches.`);
    for (const m of matches) {
        if (m.text.toLowerCase().includes('baserow')) {
            console.log(`[MATCH] ${m.timestamp} - ${m.text}`);
        } else {
            console.log(`[OTHER] ${m.timestamp} - ${m.text.substring(0, 50)}...`);
        }
    }
}

checkPinecone().catch(console.error);
