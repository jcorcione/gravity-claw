import { VercelRequest, VercelResponse } from "@vercel/node";
import { initMemory, getGlobalStats, getScheduleCount } from "../../src/memory-pg.js";
import { initPinecone, getPineconeStats } from "../../src/pinecone.js";

// Middleware to verify Admin
function verifyAdmin(req: VercelRequest): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

    const token = authHeader.split(" ")[1];
    const allowedIds = (process.env.ALLOWED_USER_IDS || "").split(",");

    if (!allowedIds.includes(token)) return null;

    return token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const adminId = verifyAdmin(req);
    if (!adminId) {
        return res.status(403).json({ error: "Unauthorized Admin Access" });
    }

    try {
        await initMemory();
        try { await initPinecone(); } catch (e) { }

        const { userCount, dbByteSize } = await getGlobalStats();
        const pineconeRecords = await getPineconeStats().catch(() => 0);
        const schedules = await getScheduleCount();

        return res.status(200).json({
            users: userCount,
            dbSizeMB: (dbByteSize / 1024 / 1024).toFixed(2),
            vectors: pineconeRecords,
            schedules: schedules
        });

    } catch (error: any) {
        console.error("Admin Status Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
