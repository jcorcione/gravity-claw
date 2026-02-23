import { VercelRequest, VercelResponse } from "@vercel/node";

function verifyAdmin(req: VercelRequest): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

    const token = authHeader.split(" ")[1];
    const allowedIds = (process.env.ALLOWED_USER_IDS || "").split(",");

    if (!allowedIds.includes(token)) return null;

    return token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const adminId = verifyAdmin(req);
    if (!adminId) {
        return res.status(403).json({ error: "Unauthorized Admin Access" });
    }

    const { action } = req.body;

    // In Vercel, the host header is reliable. We use it to loopback an HTTP request to our own cron endpoints.
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    try {
        if (action === "briefing") {
            const cronRes = await fetch(`${baseUrl}/api/morning-briefing`, { method: "POST" });
            const data = await cronRes.json();
            return res.status(cronRes.status).json(data);
        } else if (action === "recommendations") {
            const cronRes = await fetch(`${baseUrl}/api/smart-recommendations`, { method: "POST" });
            const data = await cronRes.json();
            return res.status(cronRes.status).json(data);
        } else {
            return res.status(400).json({ error: "Invalid task action" });
        }
    } catch (error: any) {
        console.error("Admin Tasks Error:", error);
        return res.status(500).json({ error: `Task trigger failed: ${error.message}` });
    }
}
