import { NextRequest, NextResponse } from "next/server";

const RAILWAY_URL = process.env.RAILWAY_URL || "https://gravity-claw-production.up.railway.app";

export async function POST(req: NextRequest) {
    const { action } = await req.json() as { action: string };

    const endpoints: Record<string, string> = {
        "briefing": `${RAILWAY_URL}/api/morning-briefing`,
        "email-scan": `${RAILWAY_URL}/api/email-scan`,
        "balance": `${RAILWAY_URL}/api/balance`,
    };

    const url = endpoints[action];
    if (!url) {
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });
        const text = await res.text();
        return NextResponse.json({ ok: true, status: res.status, body: text });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
