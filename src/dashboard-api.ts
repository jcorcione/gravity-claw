import { Router } from "express";
import {
    getAllUsers,
    getAllFacts,
    getTranscript,
    getGlobalStats,
    listSchedules,
    getMemoryCount,
    type User,
} from "./memory-pg.js";
import { getPineconeStats } from "./pinecone.js";
import { config } from "./config.js";

const router = Router();

// ─── CORS headers for Mission Control ────────────────────

router.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-dashboard-token");
    next();
});

// ─── Auth middleware ──────────────────────────────────────

function requireDashboardAuth(req: any, res: any, next: any) {
    const token = req.headers["x-dashboard-token"] as string;
    const expected = process.env.DASHBOARD_SECRET || process.env.WEB_PASSCODE;
    if (!expected || token !== expected) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

// ─── GET /api/dashboard/stats ─────────────────────────────
// Returns all top-level stats for the Command Center

router.get("/stats", requireDashboardAuth, async (_req, res) => {
    try {
        const [globalStats, pineconeVectors] = await Promise.all([
            getGlobalStats(),
            getPineconeStats(),
        ]);

        // Get per-user fact counts for comparison
        const users = await getAllUsers();
        const userStats = await Promise.all(
            users.map(async (u: User) => {
                const memCount = await getMemoryCount(u.id);
                const factCount = (await getAllFacts(u.id)).length;
                const schedCount = await (async () => {
                    const s = await listSchedules(u.id);
                    return s.length;
                })();
                return {
                    userId: u.id,
                    name: u.name,
                    email: u.email,
                    memoryCount: memCount,
                    factCount,
                    scheduleCount: schedCount,
                };
            })
        );

        // OpenRouter balance
        let balance = { total: 0, used: 0, remaining: 0 };
        try {
            const orRes = await fetch("https://openrouter.ai/api/v1/credits", {
                headers: { Authorization: `Bearer ${config.openRouterApiKey}` },
            });
            const orData = await orRes.json() as any;
            balance = {
                total: parseFloat(orData?.data?.total_credits || 0),
                used: parseFloat(orData?.data?.total_usage || 0),
                remaining: parseFloat(orData?.data?.total_credits || 0) - parseFloat(orData?.data?.total_usage || 0),
            };
        } catch { /* ignore if OpenRouter is unreachable */ }

        res.json({
            users: globalStats.userCount,
            dbByteSize: globalStats.dbByteSize,
            pineconeVectors,
            balance,
            userStats,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/dashboard/messages ─────────────────────────
// Tier 1 memory: recent messages across all users

router.get("/messages", requireDashboardAuth, async (req, res) => {
    try {
        const userId = (req.query.userId as string) || "default_user";
        const limit = parseInt((req.query.limit as string) || "30");
        const messages = await getTranscript(limit, userId);
        res.json({ messages });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/dashboard/facts ────────────────────────────
// Tier 2 memory: structured user facts

router.get("/facts", requireDashboardAuth, async (req, res) => {
    try {
        const userId = (req.query.userId as string) || "default_user";
        const facts = await getAllFacts(userId);
        res.json({ facts });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/dashboard/schedules ────────────────────────
// Cron schedule list

router.get("/schedules", requireDashboardAuth, async (req, res) => {
    try {
        const userId = (req.query.userId as string) || "default_user";
        const schedules = await listSchedules(userId);
        res.json({ schedules });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/dashboard/users ────────────────────────────
// All registered users

router.get("/users", requireDashboardAuth, async (_req, res) => {
    try {
        const users = (await getAllUsers()).map((u: User) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            // Never expose password_hash or google_refresh_token
        }));
        res.json({ users });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
