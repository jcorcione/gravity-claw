"use client";

import { useEffect, useState, useRef } from "react";
import { Search, Plus, Tag, Clock } from "lucide-react";

interface Message {
    id: string;
    role: string;
    content: string;
    user_id: string;
    created_at: string;
}

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function roleColor(role: string): string {
    return { user: "--blue", assistant: "--orange", tool: "--green", system: "--purple" }[role] || "--text-muted";
}

export default function BrainPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [filtered, setFiltered] = useState<Message[]>([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [activeRole, setActiveRole] = useState<string>("all");
    const [quickInput, setQuickInput] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        fetch("/api/stats")
            .then(r => r.json())
            .then(d => {
                setMessages(d.messages || []);
                setFiltered(d.messages || []);
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        const q = query.toLowerCase();
        const roleFilter = activeRole === "all" ? messages : messages.filter(m => m.role === activeRole);
        setFiltered(q ? roleFilter.filter(m => m.content?.toLowerCase().includes(q)) : roleFilter);
    }, [query, activeRole, messages]);

    const saveMemory = async () => {
        if (!quickInput.trim()) return;
        setSaving(true);
        await fetch("/api/action", {
            method: "POST",
            body: JSON.stringify({ action: "memory", content: quickInput }),
            headers: { "Content-Type": "application/json" },
        }).catch(() => { });
        setSaving(false);
        setSaved(true);
        setQuickInput("");
        setTimeout(() => setSaved(false), 3000);
    };

    const ROLES = ["all", "user", "assistant", "tool", "system"];

    return (
        <>
            <div className="page-header fade-in">
                <h1>Second Brain</h1>
                <p>Nexus&apos;s memory — conversation history and stored knowledge</p>
            </div>

            {/* Quick Add */}
            <div className="card fade-in fade-in-1" style={{ marginBottom: 24 }}>
                <div className="card-title mb-4">Quick Memory Save</div>
                <div style={{ display: "flex", gap: 8 }}>
                    <input
                        className="input"
                        placeholder="Tell Nexus something to remember… e.g. 'I prefer morning standups'"
                        value={quickInput}
                        onChange={e => setQuickInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveMemory(); }}
                    />
                    <button
                        className="btn btn-primary"
                        onClick={saveMemory}
                        disabled={saving}
                        style={{ whiteSpace: "nowrap" }}
                    >
                        <Plus size={14} />
                        {saved ? "Saved!" : saving ? "Saving…" : "Save"}
                    </button>
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 8 }}>
                    This will trigger the <code style={{ background: "var(--bg-elevated)", padding: "1px 4px", borderRadius: 3 }}>save_semantic_memory</code> tool via Nexus.
                </p>
            </div>

            {/* Stat row */}
            <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 24 }}>
                {[
                    { label: "Total Messages", value: messages.length, color: "blue" },
                    { label: "User Messages", value: messages.filter(m => m.role === "user").length, color: "orange" },
                    { label: "Agent Responses", value: messages.filter(m => m.role === "assistant").length, color: "green" },
                    { label: "Tool Calls", value: messages.filter(m => m.role === "tool").length, color: "purple" },
                ].map(({ label, value, color }, i) => (
                    <div key={label} className={`stat-card ${color} fade-in fade-in-${i + 2}`}>
                        <div className="stat-value">{loading ? "—" : value}</div>
                        <div className="stat-label">{label}</div>
                    </div>
                ))}
            </div>

            {/* Search + filter */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1 }}>
                    <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                    <input
                        className="input"
                        style={{ paddingLeft: 36 }}
                        placeholder="Search messages…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                </div>
                <div className="tabs" style={{ marginBottom: 0 }}>
                    {ROLES.map(role => (
                        <button key={role} className={`tab ${activeRole === role ? "active" : ""}`} onClick={() => setActiveRole(role)}>
                            {role.charAt(0).toUpperCase() + role.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Memory Cards */}
            {loading ? (
                <div className="memory-grid">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="memory-card">
                            <div className="skeleton" style={{ height: 12, width: "30%", marginBottom: 8 }} />
                            <div className="skeleton" style={{ height: 60 }} />
                            <div className="skeleton" style={{ height: 10, width: "40%", marginTop: 8 }} />
                        </div>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
                    <p>No memories match your search.</p>
                </div>
            ) : (
                <div className="memory-grid">
                    {filtered.map((msg, i) => (
                        <div key={msg.id} className={`memory-card fade-in fade-in-${(i % 5) + 1}`}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span className={`badge badge-${msg.role === "user" ? "blue" : msg.role === "assistant" ? "orange" : msg.role === "tool" ? "green" : "gray"
                                    }`}>
                                    <Tag size={8} />{msg.role}
                                </span>
                                <span style={{ fontSize: "0.68rem", color: "var(--text-disabled)", display: "flex", alignItems: "center", gap: 3 }}>
                                    <Clock size={9} />{timeAgo(msg.created_at)}
                                </span>
                            </div>
                            <div className="memory-content">
                                {msg.content?.substring(0, 200)}{msg.content?.length > 200 ? "…" : ""}
                            </div>
                            <div className="memory-meta">user:{msg.user_id}</div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
