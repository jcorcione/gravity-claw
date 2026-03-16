import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config();

async function queryMessages() {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) {
        console.error("No SUPABASE_DB_URL found");
        return;
    }

    const sql = postgres(connectionString, { ssl: "require" });
    try {
        const rows = await sql`
            SELECT id, user_id, role, content, created_at 
            FROM messages 
            ORDER BY id DESC 
            LIMIT 50
        `;
        
        console.log(`--- LAST 10 MESSAGES ---`);
        for (const row of rows) {
            console.log(`\n[${row.created_at.toISOString()}] ${row.role.toUpperCase()}:`);
            console.log(row.content);
        }
    } catch (e) {
        console.error("Error querying messages:", e);
    } finally {
        await sql.end();
    }
}

queryMessages().catch(console.error);
