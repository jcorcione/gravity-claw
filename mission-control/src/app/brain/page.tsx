"use client";

import { useEffect, useState } from "react";
import { Search, Plus, Tag, Clock, User, Cpu, Brain } from "lucide-react";

interface Message {
    id: string;
    role: string;
    content: string;
    user_id: string;
    created_at?: string;
    timestamp?: string;
}

interface Fact {
    id: number;
    entity: string;
    attribute: string;
    value: string;
    created_at: string;
    user_id: string;
}

interface DashboardData {
    tier1Messages: Message[];
    tier2Facts: Fact[];
    pineconeVectors: number;
    userStats: Array<{ userId: string; name: string; factCount: number; memoryCount: number }>;
}

function timeAgo(dateStr?: string) {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

type ActiveTab = "messages" | "facts" | "semantic";

export default function BrainPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [activeTab, setActiveTab] = useState<ActiveTab>("messages");
    const [activeRole, setActiveRole] = useState("all");
    const [quickInput, setQuickInput] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        fetch("/api/stats")
            .then(r => r.json())
            .then(d => setData(d))
            .finally(() => setLoading(false));
    }, []);

    const messages = data?.tier1Messages ?? [];
    const facts = data?.tier2Facts ?? [];

    const filteredMessages = messages.filter(m => {
        const roleMatch = activeRole === "all" || m.role === activeRole;
        const queryMatch = !query || m.content?.toLowerCase().includes(query.toLowerCase());
        return roleMatch && queryMatch;
    });

    const filteredFacts = facts.filter(f => {
        if (!query) return true;
        const q = query.toLowerCase();
        return (
            f.entity?.toLowerCase().includes(q) ||
            f.attribute?.toLowerCase().includes(q) ||
            f.value?.toLowerCase().includes(q)
        );
    });

    const ROLES = ["all", "user", "assistant", "tool", "system"];

    return (
        <>
            <div className="page-header fade-in">
                <h1>Second Brain</h1>
                <p>All 3 tiers of Nexus&apos;s memory — conversations, facts, and semantic vectors</p>
            </div>

            {/* Memory Tier Stats */}
            <div className="stat-grid fade-in fade-in-1" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 24 }}>
                {[
                    { label: "Tier 1 — Messages", value: loading ? "—" : messages.length, color: "blue", Icon: Brain, desc: "Conversation history" },
                    { label: "Tier 2 — Structured Facts", value: loading ? "—" : facts.length, color: "orange", Icon: User, desc: "jcorcione facts" },
                    { label: "Tier 3 — Semantic Vectors", value: loading ? "—" : data?.pineconeVectors, color: "green", Icon: Cpu, desc: "Pinecone embeddings" },
                ].map(({ label, value, color, Icon, desc }, i) => (
                    <div key={label} className={`stat-card ${color} fade-in fade-in-${i + 1}`}>
                        <div className={`stat-icon ${color}`}><Icon size={16} /></div>
                        <div className="stat-value">{String(value)}</div>
                        <div className="stat-label">{label}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-disabled)", marginTop: 4 }}>{desc}</div>
                    </div>
                ))}
            </div>

            {/* Quick Add */}
            <div className="card fade-in fade-in-2" style={{ marginBottom: 20 }}>
                <div className="card-title mb-4">Quick Memory Save</div>
                <div style={{ display: "flex", gap: 8 }}>
                    <input
                        className="input"
                        placeholder="Tell Nexus something to remember… e.g. 'I prefer morning standups'"
                        value={quickInput}
                        onChange={e => setQuickInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { setSaving(true); setTimeout(() => { setSaving(false); setSaved(true); setQuickInput(""); setTimeout(() => setSaved(false), 2500); }, 800); } }}
                    />
                    <button
                        className="btn btn-primary"
                        style={{ whiteSpace: "nowrap" }}
                        disabled={saving}
                        onClick={() => { setSaving(true); setTimeout(() => { setSaving(false); setSaved(true); setQuickInput(""); setTimeout(() => setSaved(false), 2500); }, 800); }}
                    >
                        <Plus size={14} />
                        {saved ? "Saved!" : saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>

            {/* Tab selector */}
            <div className="tabs fade-in fade-in-3">
                {(["messages", "facts", "semantic"] as ActiveTab[]).map(t => (
                    <button key={t} className={`tab ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)}>
                        {t === "messages" ? "💬 Tier 1: Messages" : t === "facts" ? "📌 Tier 2: Facts" : "🧠 Tier 3: Semantic"}
                    </button>
                ))}
            </div>

            {/* Search */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1 }}>
                    <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                    <input
                        className="input"
                        style={{ paddingLeft: 36 }}
                        placeholder={activeTab === "facts" ? "Search facts…" : "Search messages…"}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                </div>
                {activeTab === "messages" && (
                    <div className="tabs" style={{ marginBottom: 0 }}>
                        {ROLES.map(r => (
                            <button key={r} className={`tab ${activeRole === r ? "active" : ""}`} onClick={() => setActiveRole(r)}>
                                {r.charAt(0).toUpperCase() + r.slice(1)}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Tier 1: Messages */}
            {activeTab === "messages" && (
                loading ? (
                    <div className="memory-grid">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="memory-card"><div className="skeleton" style={{ height: 80 }} /></div>)}</div>
                ) : filteredMessages.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>No messages match your filter.</div>
                ) : (
                    <div className="memory-grid">
                        {filteredMessages.map((msg, i) => (
                            <div key={i} className={`memory-card fade-in fade-in-${(i % 5) + 1}`}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span className={`badge ${msg.role === "user" ? "badge-blue" : msg.role === "assistant" ? "badge-orange" : msg.role === "tool" ? "badge-green" : "badge-gray"}`}>
                                        <Tag size={8} />{msg.role}
                                    </span>
                                    <span style={{ fontSize: "0.68rem", color: "var(--text-disabled)", display: "flex", alignItems: "center", gap: 3 }}>
                                        <Clock size={9} />{timeAgo(msg.timestamp || msg.created_at)}
                                    </span>
                                </div>
                                <div className="memory-content">{msg.content?.substring(0, 220)}{msg.content && msg.content.length > 220 ? "…" : ""}</div>
                                <div className="memory-meta">user:{msg.user_id}</div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* Tier 2: Facts */}
            {activeTab === "facts" && (
                loading ? (
                    <div className="memory-grid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="memory-card"><div className="skeleton" style={{ height: 70 }} /></div>)}</div>
                ) : filteredFacts.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
                        No stored facts found. Try asking Nexus to &ldquo;remember&rdquo; something about you!
                    </div>
                ) : (
                    <div className="memory-grid">
                        {filteredFacts.map((f, i) => (
                            <div key={f.id} className={`memory-card fade-in fade-in-${(i % 5) + 1}`}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span className="badge badge-orange">{f.entity}</span>
                                    <span className="badge badge-gray">{f.attribute}</span>
                                </div>
                                <div className="memory-content" style={{ fontWeight: 500 }}>{f.value}</div>
                                <div className="memory-meta">{timeAgo(f.created_at)}</div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* Tier 3: Semantic / Pinecone */}
            {activeTab === "semantic" && (
                <div className="card fade-in">
                    <div className="card-title mb-4">Tier 3 — Pinecone Semantic Vectors</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", padding: "20px", textAlign: "center" }}>
                            <div className="stat-value" style={{ color: "var(--green)", marginBottom: 6 }}>
                                {loading ? "—" : (data?.pineconeVectors ?? 0).toLocaleString()}
                            </div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>semantic memory embeddings stored</div>
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: 1.7 }}>
                            <p>Tier 3 memories are OpenAI <code style={{ background: "var(--bg-elevated)", padding: "1px 4px", borderRadius: 3 }}>text-embedding-3-small</code> vectors stored in the Pinecone index <strong>gravity-claw</strong>.</p>
                            <br />
                            <p>They are created whenever you ask Nexus to <em>remember</em> something through the <code style={{ background: "var(--bg-elevated)", padding: "1px 4px", borderRadius: 3 }}>save_semantic_memory</code> tool. Search is powered by cosine similarity — Nexus searches them on every conversation turn to provide contextually relevant responses.</p>
                            <br />
                            <p>To browse the raw vectors, visit your <a href="https://app.pinecone.io" target="_blank" rel="noreferrer" style={{ color: "var(--green)" }}>Pinecone dashboard</a> and select the <strong>gravity-claw</strong> index.</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
