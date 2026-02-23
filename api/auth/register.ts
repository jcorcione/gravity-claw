import { VercelRequest, VercelResponse } from "@vercel/node";
import { initMemory, registerUser } from "../../src/memory-pg.js";
import crypto from "crypto";

// Simple password hashing function using Node's native crypto
function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derivedKey}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        await initMemory(); // Ensure DB is initialized
        const { email, name, password } = req.body;

        if (!email || !name || !password) {
            return res.status(400).json({ error: "Email, name, and password are required" });
        }

        // Generate a simple UUID
        const newUserId = crypto.randomUUID();
        const hashedPassword = hashPassword(password);

        try {
            const newUser = await registerUser(newUserId, email.toLowerCase(), name, hashedPassword);
            if (!newUser) {
                return res.status(500).json({ error: "Failed to create user" });
            }
            return res.status(200).json({ success: true, userId: newUser.id, name: newUser.name });
        } catch (dbError: any) {
            if (dbError.message === "Email already exists") {
                return res.status(409).json({ error: "Email is already registered" });
            }
            throw dbError;
        }

    } catch (error: any) {
        console.error("Registration Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
