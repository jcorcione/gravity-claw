import 'dotenv/config';
import crypto from 'crypto';
import postgres from 'postgres';

function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derivedKey}`;
}

async function run() {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) throw new Error("SUPABASE_DB_URL is not set");

    const sql = postgres(connectionString, { ssl: "require" });

    // 1. Get the owner ID
    const ownerId = process.env.ALLOWED_USER_IDS?.split(',')[0];
    if (!ownerId) {
        console.error("No ALLOWED_USER_IDS found in .env");
        process.exit(1);
    }

    const defaultEmail = "admin@nexus.ai";
    const defaultPass = "Salem_318!";
    const hashed = hashPassword(defaultPass);

    console.log(`Inserting Super User '${ownerId}' with email '${defaultEmail}'...`);

    await sql`
        INSERT INTO users (id, email, name, password_hash)
        VALUES (${ownerId}, ${defaultEmail}, 'Admin', ${hashed})
        ON CONFLICT (id) 
        DO UPDATE SET 
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash
    `;

    console.log("Success! Admin user has been seeded into Supabase.");
    console.log(`Login Email: ${defaultEmail}`);
    console.log(`Login Password: ${defaultPass}`);

    await sql.end();
    process.exit(0);
}

run();
