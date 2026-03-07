import * as dotenv from 'dotenv';
dotenv.config();

import { getSql } from './src/memory-pg.js';

async function clearBaserowMessages() {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) throw new Error("SUPABASE_DB_URL is not set");

    const postgres = (await import('postgres')).default;
    const sql = postgres(connectionString, { ssl: "require" });

    console.log("Deleting messages mentioning baserow...");
    const result = await sql`DELETE FROM messages WHERE content ILIKE '%baserow%' OR role = 'tool'`;
    console.log(`Deleted ${result.count} messages.`);

    await sql.end();
}

clearBaserowMessages().catch(console.error);
