import "dotenv/config";
import { initMemory, getUserByEmail } from "./src/memory-pg.js";

async function main() {
    await initMemory();
    const email = "jcorcione@gmail.com";
    const user = await getUserByEmail(email);
    if (user) {
        console.log(`User found: ${user.name} (${user.id})`);
        console.log(`Password Hash exists: ${!!user.password_hash}`);
    } else {
        console.log(`User not found: ${email}`);
    }
    process.exit(0);
}
main().catch(console.error);
