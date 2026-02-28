"use client";

import { useState } from "react";
import { CheckCircle, XCircle, ExternalLink } from "lucide-react";

interface Connection {
    id: string;
    name: string;
    desc: string;
    emoji: string;
    status: "active" | "optional" | "inactive";
    envHint?: string;
    link?: string;
    tag?: string;
}

const CONNECTIONS: Connection[] = [
    { id: "supabase", name: "Supabase", desc: "PostgreSQL database for messages, facts, schedules", emoji: "🟢", status: "active", link: "https://supabase.com" },
    { id: "pinecone", name: "Pinecone", desc: "Vector DB for semantic memory & embeddings", emoji: "🌲", status: "active", link: "https://pinecone.io" },
    { id: "openrouter", name: "OpenRouter", desc: "LLM routing — Claude Sonnet 4.5 (primary model)", emoji: "🔀", status: "active", link: "https://openrouter.ai" },
    { id: "gmail", name: "Google Gmail", desc: "Direct googleapis client — recruiter email scanner", emoji: "📩", status: "active", tag: "Direct API" },
    { id: "calendar", name: "Google Calendar", desc: "Read/write calendar events via googleapis", emoji: "📅", status: "active", tag: "Direct API" },
    { id: "telegram", name: "Telegram Bot", desc: "Primary chat interface via grammY", emoji: "✈️", status: "active", link: "https://t.me" },
    { id: "discord", name: "Discord Bot", desc: "Server & DM interface via discord.js", emoji: "🎮", status: "active", link: "https://discord.com" },
    { id: "sheets", name: "Google Sheets", desc: "Recruiter draft log — tracks cover letters", emoji: "📊", status: "active", tag: "Direct API" },
    { id: "elevenlabs", name: "ElevenLabs TTS", desc: "Text-to-speech voice replies", emoji: "🎙️", status: "optional", envHint: "ELEVENLABS_API_KEY" },
    { id: "groq", name: "Groq Whisper STT", desc: "Voice message transcription", emoji: "🎤", status: "optional", envHint: "GROQ_API_KEY" },
    { id: "openai", name: "OpenAI Embeddings", desc: "Embedding generation for Pinecone vectors", emoji: "🧠", status: "active", link: "https://openai.com" },
    { id: "railway", name: "Railway (Backend)", desc: "Node.js agent server — persistent TCP connections", emoji: "🚂", status: "active", link: "https://railway.app" },
];

const STATUS_META: Record<string, { label: string; badge: string }> = {
    active: { label: "Active", badge: "badge-green" },
    optional: { label: "Optional", badge: "badge-gray" },
    inactive: { label: "Inactive", badge: "badge-red" },
};

export default function ConnectionsPage() {
    const [filter, setFilter] = useState<"all" | "active" | "optional">("all");

    const filtered = CONNECTIONS.filter(c => filter === "all" || c.status === filter);
    const activeCount = CONNECTIONS.filter(c => c.status === "active").length;

    return (
        <>
            <div className="page-header fade-in">
                <h1>Connections</h1>
                <p>Integrated services and APIs powering Nexus</p>
            </div>

            {/* Progress banner */}
            <div className="card fade-in fade-in-1" style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{activeCount} / {CONNECTIONS.length} Connected</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                            {CONNECTIONS.filter(c => c.status === "optional").length} optional integrations available
                        </div>
                    </div>
                    <div className="badge badge-green">
                        <CheckCircle size={10} />
                        Core Stack Healthy
                    </div>
                </div>
                <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(activeCount / CONNECTIONS.length) * 100}%` }} />
                </div>
            </div>

            {/* Filter tabs */}
            <div className="tabs fade-in fade-in-2">
                {(["all", "active", "optional"] as const).map(f => (
                    <button key={f} className={`tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            {/* Grid */}
            <div className="connections-grid">
                {filtered.map((conn, i) => {
                    const { label, badge } = STATUS_META[conn.status];
                    return (
                        <div key={conn.id} className={`connection-card ${conn.status === "inactive" ? "disconnected" : ""} fade-in fade-in-${(i % 4) + 2}`}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div className="connection-logo" style={{ fontSize: "1.3rem" }}>{conn.emoji}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    {conn.tag && <span className="badge badge-blue">{conn.tag}</span>}
                                    <span className={`badge ${badge}`}>{label}</span>
                                </div>
                            </div>
                            <div>
                                <div className="connection-name">{conn.name}</div>
                                <div className="connection-desc">{conn.desc}</div>
                            </div>
                            {conn.envHint && (
                                <div style={{ fontSize: "0.72rem", fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)", background: "var(--bg-elevated)", padding: "4px 8px", borderRadius: "var(--radius-sm)" }}>
                                    {conn.envHint}
                                </div>
                            )}
                            {conn.link && (
                                <a href={conn.link} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.75rem", color: "var(--text-muted)" }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--orange)"; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                                >
                                    <ExternalLink size={10} /> Docs
                                </a>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
