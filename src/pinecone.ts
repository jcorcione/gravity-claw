import { Pinecone } from "@pinecone-database/pinecone";
import { config } from "./config.js";

const pc = new Pinecone({
    apiKey: config.pineconeApiKey,
});

const INDEX_NAME = "gravity-claw";

export interface SemanticMemory {
    id: string;
    text: string;
    timestamp: string;
}

/**
 * Initialize the Pinecone index (create if it doesn't exist).
 */
export async function initPinecone(): Promise<void> {
    const indexes = await pc.listIndexes();
    const indexExists = indexes.indexes?.some((i) => i.name === INDEX_NAME);

    if (!indexExists) {
        console.log(`  🌲 Creating Pinecone index: ${INDEX_NAME}...`);
        await pc.createIndex({
            name: INDEX_NAME,
            dimension: 1536, // size matches text-embedding-3-small
            metric: "cosine",
            spec: {
                serverless: {
                    cloud: "aws",
                    region: "us-east-1",
                },
            },
        });
        console.log(`  🌲 Pinecone index created.`);
    } else {
        console.log(`  🌲 Pinecone index "${INDEX_NAME}" is ready.`);
    }
}

/**
 * Save a semantic memory to Pinecone.
 */
export async function saveToPinecone(text: string, embedding: number[], userId: string = 'default_user'): Promise<string> {
    const index = pc.Index(INDEX_NAME);
    const id = `mem_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date().toISOString();

    await index.upsert({
        records: [{
            id,
            values: embedding,
            metadata: {
                user_id: userId,
                text,
                timestamp,
            },
        }]
    });

    return id;
}

/**
 * Search semantic memories in Pinecone by vector similarity.
 */
export async function searchPinecone(embedding: number[], topK: number = 5, userId: string = 'default_user'): Promise<SemanticMemory[]> {
    const index = pc.Index(INDEX_NAME);

    const queryResponse = await index.query({
        vector: embedding,
        topK,
        filter: { user_id: { $eq: userId } },
        includeMetadata: true,
    });

    if (!queryResponse.matches) {
        return [];
    }

    return queryResponse.matches.map((match) => ({
        id: match.id,
        text: (match.metadata?.text as string) || "",
        timestamp: (match.metadata?.timestamp as string) || "",
    }));
}

export async function getPineconeStats(): Promise<number> {
    try {
        const index = pc.Index(INDEX_NAME);
        const stats = await index.describeIndexStats();
        return stats.totalRecordCount || 0;
    } catch {
        return 0;
    }
}
