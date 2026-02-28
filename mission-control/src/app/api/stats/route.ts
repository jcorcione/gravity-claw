import { NextResponse } from "next/server";

const RAILWAY_URL = process.env.RAILWAY_URL || "https://gravity-claw-production.up.railway.app";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const PINECONE_INDEX = process.env.PINECONE_INDEX || "gravity-claw";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";

async function getSupabaseStats() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { messages: 0, facts: 0 };
    try {
        const [msgRes, factsRes] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/messages?select=id&limit=1`, {
                headers: { apikey: SUPABASE_ANON_KEY, "Content-Range": "0-0/*", Prefer: "count=exact" },
            }),
            fetch(`${SUPABASE_URL}/rest/v1/bot_facts?select=id&limit=1`, {
                headers: { apikey: SUPABASE_ANON_KEY, "Content-Range": "0-0/*", Prefer: "count=exact" },
            }),
        ]);
        const messages = parseInt(msgRes.headers.get("content-range")?.split("/")[1] || "0");
        const facts = parseInt(factsRes.headers.get("content-range")?.split("/")[1] || "0");
        return { messages, facts };
    } catch { return { messages: 0, facts: 0 }; }
}

async function getPineconeStats() {
    if (!PINECONE_API_KEY) return { vectors: 0 };
    try {
        const res = await fetch(`https://api.pinecone.io/indexes/${PINECONE_INDEX}`, {
            headers: { "Api-Key": PINECONE_API_KEY },
        });
        if (!res.ok) return { vectors: 0 };
        const data = await res.json() as any;
        return { vectors: data.status?.totalRecordCount || 0 };
    } catch { return { vectors: 0 }; }
}

async function getOpenRouterBalance() {
    if (!OPENROUTER_API_KEY) return { total: 0, used: 0, remaining: 0 };
    try {
        const res = await fetch("https://openrouter.ai/api/v1/credits", {
            headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
        });
        const data = await res.json() as any;
        const total = parseFloat(data?.data?.total_credits || 0);
        const used = parseFloat(data?.data?.total_usage || 0);
        return { total, used, remaining: total - used };
    } catch { return { total: 0, used: 0, remaining: 0 }; }
}

async function getRecentMessages() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/messages?select=id,role,content,user_id,created_at&order=created_at.desc&limit=20`,
            { headers: { apikey: SUPABASE_ANON_KEY } }
        );
        return await res.json() as any[];
    } catch { return []; }
}

export async function GET() {
    const [supabase, pinecone, balance, messages] = await Promise.all([
        getSupabaseStats(),
        getPineconeStats(),
        getOpenRouterBalance(),
        getRecentMessages(),
    ]);

    return NextResponse.json({ supabase, pinecone, balance, messages, railwayUrl: RAILWAY_URL });
}
