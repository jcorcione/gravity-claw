import * as dotenv from 'dotenv';
dotenv.config();

import { getSql } from './src/memory-pg.js';

async function checkGmailMemories() {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) throw new Error("SUPABASE_DB_URL is not set");

    const postgres = (await import('postgres')).default;
    const sql = postgres(connectionString, { ssl: "require" });

    console.log("--- FACTS ---");
    const facts = await sql`SELECT * FROM facts WHERE value ILIKE '%gmail%' OR entity ILIKE '%gmail%' OR attribute ILIKE '%gmail%'`;
    for (const f of facts) {
        console.log(`[ID: ${f.id}] ${f.entity} | ${f.attribute} = ${f.value}`);
    }

    console.log("\n--- MESSAGES (Last 50) ---");
    const msgs = await sql`SELECT * FROM messages WHERE content ILIKE '%gmail%' OR content ILIKE '%broken%' ORDER BY id DESC LIMIT 50`;
    console.log(`Found ${msgs.length} recent messages mentioning gmail or broken.`);
    for (const m of msgs) {
        console.log(`[${m.role}] ${m.content?.substring(0, 100)}...`);
    }

    await sql.end();
}

checkGmailMemories().catch(console.error);
