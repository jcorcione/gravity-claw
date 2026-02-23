import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'auth', 'storage', 'graphql', 'graphql_public', 'pgbouncer', 'pgsodium_masks', 'realtime', 'supabase_functions', 'supabase_migrations')
            ORDER BY table_schema, table_name;
        `);
        console.log("Found tables:", res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}
check();
