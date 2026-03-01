import { NextRequest, NextResponse } from "next/server";

const RAILWAY_URL = process.env.RAILWAY_URL || "https://gravity-claw-production-d161.up.railway.app";
const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET || "";

const RAILWAY_ACTIONS: Record<string, { path: string; method?: string }> = {
    "briefing": { path: "/api/morning-briefing", method: "POST" },
    "email-scan": { path: "/api/email-scan", method: "POST" },
};

export async function POST(req: NextRequest) {
    const { action } = await req.json() as { action: string };

    const endpoint = RAILWAY_ACTIONS[action];
    if (!endpoint) {
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    try {
        const res = await fetch(`${RAILWAY_URL}${endpoint.path}`, {
            method: endpoint.method || "POST",
            headers: {
                "Content-Type": "application/json",
                "x-dashboard-token": DASHBOARD_SECRET,
            },
        });
        const text = await res.text();
        return NextResponse.json({ ok: true, status: res.status, body: text });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
