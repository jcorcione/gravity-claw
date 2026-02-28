import { NextResponse } from "next/server";

// The Railway backend is the single source of truth for all data.
// Mission Control calls Railway, which queries Supabase + Pinecone internally.
const RAILWAY_URL = process.env.RAILWAY_URL || "https://gravity-claw-production.up.railway.app";
const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET || "";

async function callRailway(path: string) {
    const res = await fetch(`${RAILWAY_URL}/api/dashboard/${path}`, {
        headers: {
            "x-dashboard-token": DASHBOARD_SECRET,
            "Content-Type": "application/json",
        },
        // Don't cache — always fresh data
        cache: "no-store",
    });
    if (!res.ok) {
        throw new Error(`Railway returned ${res.status} on /api/dashboard/${path}`);
    }
    return res.json();
}

export async function GET() {
    try {
        // Fetch all data tiers in parallel from Railway
        const [statsData, messagesData, factsData, schedulesData] = await Promise.allSettled([
            callRailway("stats"),
            callRailway("messages?userId=default_user&limit=30"),
            callRailway("facts?userId=default_user"),
            callRailway("schedules?userId=default_user"),
        ]);

        const stats = statsData.status === "fulfilled" ? statsData.value : {};
        const messages = messagesData.status === "fulfilled" ? messagesData.value.messages ?? [] : [];
        const facts = factsData.status === "fulfilled" ? factsData.value.facts ?? [] : [];
        const schedules = schedulesData.status === "fulfilled" ? schedulesData.value.schedules ?? [] : [];

        return NextResponse.json({
            // Top-level stats
            users: (stats as any).users ?? 0,
            pineconeVectors: (stats as any).pineconeVectors ?? 0,
            balance: (stats as any).balance ?? { total: 0, used: 0, remaining: 0 },
            userStats: (stats as any).userStats ?? [],

            // 3-tier memory data
            tier1Messages: messages,  // Tier 1: Conversation history
            tier2Facts: facts,     // Tier 2: Structured facts
            schedules,                // Cron schedules
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
