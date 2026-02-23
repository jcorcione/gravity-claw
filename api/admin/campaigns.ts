import { VercelRequest, VercelResponse } from "@vercel/node";
import { initMemory } from "../../src/memory-pg.js";
import { initMcpServers, getMcpTools } from "../../src/mcp.js";

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

    if (action === "run_scan") {
        try {
            await initMemory();
            await initMcpServers();
            const tools = getMcpTools();
            const scanTool = tools.find((t: any) => t.name === "scan_recruiter_emails");
            if (!scanTool) return res.status(500).json({ error: "Scanner tool not available" });
            const reply = await scanTool.execute({ maxEmails: 50 }, { userId: adminId });
            return res.status(200).json({ message: reply });
        } catch (error: any) {
            console.error("Campaign Scan Error:", error);
            return res.status(500).json({ error: `Scan failed: ${error.message}` });
        }
    }

    return res.status(400).json({ error: "Invalid action" });
}
