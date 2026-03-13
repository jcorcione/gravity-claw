import "dotenv/config";
import { initMemory, getUser } from "./src/memory-pg.js";
import postgres from "postgres";
import crypto from "crypto";

function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derivedKey}`;
}

async function main() {
    await initMemory();

    const sql = postgres(process.env.SUPABASE_DB_URL!, { ssl: "require" });
    const TELEGRAM_ID = (process.env.ALLOWED_USER_IDS || "").split(",")[0].trim();

    // Check what is currently under this ID
    const user = await getUser(TELEGRAM_ID);
    console.log("Current Admin User Record:");
    console.log(user);

    // Force update the email and password
    const newPassword = process.env.WEB_PASSCODE;
    if (!newPassword) {
        console.error("❌ WEB_PASSCODE is not set in .env. Aborting.");
        process.exit(1);
    }
    console.log("Forcing update to jcorcione@gmail.com with password from WEB_PASSCODE...");
    const hashedPassword = hashPassword(newPassword);
    await sql`
        UPDATE users 
        SET email = 'jcorcione@gmail.com', password_hash = ${hashedPassword}
        WHERE id = ${TELEGRAM_ID}
    `;

    console.log("Update successful!");
    process.exit(0);
}

main().catch(console.error);
