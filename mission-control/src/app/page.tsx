"use client";

import { useEffect, useState } from "react";
import {
  MessageSquare, Database, Cpu, Calendar,
  DollarSign, Zap, Mail, RefreshCw,
} from "lucide-react";

interface Stats {
  users: number;
  pineconeVectors: number;
  balance: { total: number; used: number; remaining: number };
  tier1Messages: Array<{ id?: string; role: string; content: string; user_id: string; created_at?: string; timestamp?: string }>;
  tier2Facts: Array<{ id: number; entity: string; attribute: string; value: string }>;
  schedules: Array<{ id: number; name: string; cron: string }>;
}

const ROLE_ICON: Record<string, string> = {
  user: "💬",
  assistant: "🤖",
  tool: "🔧",
  system: "⚙️",
};

const ROLE_COLOR: Record<string, string> = {
  user: "--blue",
  assistant: "--orange",
  tool: "--green",
  system: "--purple",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function CommandCenter() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<Record<string, "idle" | "loading" | "done">>({});

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      setStats(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const triggerAction = async (action: string) => {
    setActionState(s => ({ ...s, [action]: "loading" }));
    try {
      await fetch("/api/action", { method: "POST", body: JSON.stringify({ action }), headers: { "Content-Type": "application/json" } });
      setActionState(s => ({ ...s, [action]: "done" }));
      setTimeout(() => setActionState(s => ({ ...s, [action]: "idle" })), 3000);
    } catch {
      setActionState(s => ({ ...s, [action]: "idle" }));
    }
  };

  const balance = stats?.balance;
  const balanceLow = balance && balance.remaining < 5;
  const messages = stats?.tier1Messages ?? [];

  return (
    <>
      <div className="page-header fade-in">
        <h1>Command Center</h1>
        <p>Real-time overview of your AgenticHQ agent</p>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        {[
          { label: "Messages Stored", value: loading ? "—" : messages.length.toLocaleString(), color: "blue", Icon: MessageSquare },
          { label: "Semantic Memories", value: loading ? "—" : (stats?.pineconeVectors ?? 0).toLocaleString(), color: "orange", Icon: Cpu },
          { label: "Stored Facts", value: loading ? "—" : (stats?.tier2Facts?.length ?? 0).toLocaleString(), color: "purple", Icon: Database },
          {
            label: "OpenRouter Balance",
            value: loading ? "—" : `$${balance?.remaining.toFixed(2)}`,
            color: balanceLow ? "red" : "green",
            Icon: DollarSign,
            badge: balanceLow ? "LOW" : undefined,
          },
        ].map(({ label, value, color, Icon, badge }, i) => (
          <div key={label} className={`stat-card ${color} fade-in fade-in-${i + 1}`}>
            {badge && <div className="stat-badge" style={{ background: "var(--red-dim)", color: "var(--red)" }}>{badge}</div>}
            <div className={`stat-icon ${color}`}><Icon size={16} /></div>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>

        {/* Activity Feed */}
        <div className="card fade-in fade-in-3">
          <div className="card-header">
            <div className="card-title">Live Activity Feed</div>
            <button className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "4px 8px" }} onClick={fetchStats}>
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>
          <div className="activity-feed">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="activity-item">
                  <div className="skeleton" style={{ width: 32, height: 32, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 14, width: "60%", marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 11, width: "35%" }} />
                  </div>
                </div>
              ))
            ) : messages.length === 0 ? (
              <p style={{ color: "var(--text-muted)", padding: "20px 0", fontSize: "0.85rem" }}>
                No messages yet. Start chatting on Telegram or Discord!
              </p>
            ) : messages.map((msg, idx) => (
              <div key={msg.id ?? idx} className="activity-item">
                <div
                  className="activity-icon"
                  style={{ background: `var(${ROLE_COLOR[msg.role] || "--bg-elevated"}-dim, var(--bg-elevated))` }}
                >
                  <span style={{ fontSize: "0.9rem" }}>{ROLE_ICON[msg.role] || "💬"}</span>
                </div>
                <div className="activity-body">
                  <div className="activity-title">
                    <span style={{ color: `var(${ROLE_COLOR[msg.role] || "--text-muted"})`, fontWeight: 600 }}>
                      [{msg.role}]
                    </span>
                    {" "}{msg.content?.substring(0, 80)}{msg.content?.length > 80 ? "…" : ""}
                  </div>
                  <div className="activity-meta">
                    user:{msg.user_id} · {timeAgo(msg.created_at ?? msg.timestamp ?? "")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Quick Actions */}
          <div className="card fade-in fade-in-4">
            <div className="card-title mb-4">Quick Actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { key: "briefing", label: "Trigger Morning Briefing", Icon: Calendar },
                { key: "email-scan", label: "Run Email Scan", Icon: Mail },
                { key: "balance", label: "Check OpenRouter Balance", Icon: DollarSign },
              ].map(({ key, label, Icon }) => {
                const state = actionState[key] || "idle";
                return (
                  <button
                    key={key}
                    onClick={() => triggerAction(key)}
                    disabled={state === "loading"}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: state === "done" ? "var(--green-dim)" : "var(--bg-elevated)",
                      border: `1px solid ${state === "done" ? "var(--green)" : "var(--border)"}`,
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 12px",
                      color: state === "done" ? "var(--green)" : "var(--text-primary)",
                      fontSize: "0.82rem",
                      fontWeight: 500,
                      width: "100%",
                      textAlign: "left",
                      cursor: state === "loading" ? "wait" : "pointer",
                      transition: "all var(--transition)",
                      opacity: state === "loading" ? 0.6 : 1,
                    }}
                  >
                    <Icon size={14} />
                    {state === "loading" ? "Running…" : state === "done" ? "✓ Done!" : label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Agent Config */}
          <div className="card fade-in fade-in-5">
            <div className="card-title mb-4">Agent Configuration</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Model", value: "Claude Sonnet 4.5" },
                { label: "Memory", value: "Supabase + Pinecone" },
                { label: "Channels", value: "Telegram · Discord · Web" },
                { label: "Hosting", value: "Railway (backend) · Vercel (frontend)" },
                { label: "Emails", value: "Google APIs (Direct)" },
                { label: "Calendar", value: "Google Calendar API" },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-primary)", fontFamily: "JetBrains Mono, monospace" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* System Status */}
          <div className="card fade-in fade-in-6">
            <div className="card-title mb-4">System Status</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Railway Backend", status: stats !== null ? "online" : "checking" },
                { label: "Supabase DB", status: stats !== null ? "online" : "checking" },
                { label: "Pinecone Index", status: loading ? "checking" : stats !== null ? "online" : "error" },
                { label: "OpenRouter API", status: loading ? "checking" : balance?.total != null ? "online" : "error" },
              ].map(({ label, status }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{label}</span>
                  <span className={`badge badge-${status === "online" ? "green" : "gray"}`}>
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
