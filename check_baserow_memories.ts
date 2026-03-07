import * as dotenv from 'dotenv';
dotenv.config();
import { initMemory, getAllFacts, getTranscript } from './src/memory-pg.js';
import { getSql } from './src/memory-pg.js';

async function checkMemories() {
    await initMemory();

    // Have to get sql directly to do custom queries
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) throw new Error("SUPABASE_DB_URL is not set");

    const postgres = (await import('postgres')).default;
    const sql = postgres(connectionString, { ssl: "require" });

    console.log("--- FACTS ---");
    const facts = await sql`SELECT * FROM facts WHERE value ILIKE '%baserow%' OR entity ILIKE '%baserow%' OR attribute ILIKE '%baserow%'`;
    for (const f of facts) {
        console.log(`[ID: ${f.id}] ${f.entity} | ${f.attribute} = ${f.value}`);
    }

    console.log("\n--- MESSAGES (Last 50) ---");
    const msgs = await sql`SELECT * FROM messages WHERE content ILIKE '%baserow%' ORDER BY id DESC LIMIT 50`;
    console.log(`Found ${msgs.length} recent messages mentioning baserow.`);

    await sql.end();
}

checkMemories().catch(console.error);
