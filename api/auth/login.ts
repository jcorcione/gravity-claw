import { VercelRequest, VercelResponse } from "@vercel/node";
import { initMemory, getUserByEmail } from "../../src/memory-pg.js";
import crypto from "crypto";

function verifyPassword(password: string, hashString: string): boolean {
    const parts = hashString.split(":");
    if (parts.length !== 2) return false;
    const [salt, key] = parts;

    try {
        const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
        return derivedKey === key;
    } catch {
        return false;
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        await initMemory();
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const user = await getUserByEmail(email.toLowerCase());

        if (!user || !user.password_hash) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const isValid = verifyPassword(password, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // Login successful
        return res.status(200).json({ success: true, userId: user.id, name: user.name });

    } catch (error: any) {
        console.error("Login Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
