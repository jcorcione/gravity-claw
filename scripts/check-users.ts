import { sql, initMemory } from '../src/memory-pg.js';
import 'dotenv/config';

async function run() {
    await initMemory();
    const users = await sql`SELECT id, email, name, password_hash FROM users`;
    console.log("Users currently in DB:", users);
    process.exit(0);
}

run();
