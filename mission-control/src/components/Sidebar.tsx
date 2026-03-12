"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Plug,
    Brain,
    ListChecks,
    Settings,
    Zap,
    DollarSign,
} from "lucide-react";

const NAV = [
    { href: "/", label: "Command Center", Icon: LayoutDashboard },
    { href: "/connections", label: "Connections", Icon: Plug },
    { href: "/brain", label: "Second Brain", Icon: Brain },
    { href: "/tasks", label: "Tasks", Icon: ListChecks },
    { href: "/settings", label: "Settings", Icon: Settings },
];

export default function Sidebar() {
    const path = usePathname();

    return (
        <aside className="app-sidebar" style={{
            width: "var(--sidebar-width)",
            minHeight: "100vh",
            background: "var(--bg-deepest)",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            position: "sticky",
            top: 0,
            height: "100vh",
            overflow: "hidden",
        }}>

            {/* ── Brand ─────────────────────────────────── */}
            <div className="sidebar-header" style={{ padding: "24px 20px 20px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                    <div style={{
                        width: 36, height: 36,
                        background: "linear-gradient(135deg, var(--orange), #F5950F)",
                        borderRadius: 8,
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <Zap size={18} color="#0D0D0D" strokeWidth={2.5} />
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", lineHeight: 1.2 }}>
                            AgenticHQ
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
                            Mission Control v0.2
                        </div>
                    </div>
                </div>

                {/* Agent Status */}
                <div style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                }}>
                    <div className="pulse-dot" />
                    <div>
                        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-primary)" }}>
                            Nexus Online
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                            Railway · Claude Sonnet 4.5
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Navigation ────────────────────────────── */}
            <nav style={{ flex: 1, padding: "12px 12px", display: "flex", flexDirection: "column", gap: "2px" }}>
                {NAV.map(({ href, label, Icon }) => {
                    const active = path === href;
                    return (
                        <Link
                            key={href}
                            href={href}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "9px 10px",
                                borderRadius: "var(--radius-sm)",
                                fontSize: "0.84rem",
                                fontWeight: active ? 600 : 500,
                                color: active ? "var(--text-primary)" : "rgba(255,255,255,0.55)",
                                background: active ? "var(--bg-elevated)" : "transparent",
                                transition: "all var(--transition)",
                                textDecoration: "none",
                            }}
                            onMouseEnter={e => {
                                if (!active) {
                                    (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                                    (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                                }
                            }}
                            onMouseLeave={e => {
                                if (!active) {
                                    (e.currentTarget as HTMLElement).style.background = "transparent";
                                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)";
                                }
                            }}
                        >
                            <Icon
                                size={16}
                                style={{ color: active ? "var(--orange)" : "inherit", flexShrink: 0 }}
                                strokeWidth={active ? 2.5 : 2}
                            />
                            {/* We wrap the label in a span to optionally hide it or shift it on mobile if needed, though mobile CSS handles flex-direction column */}
                            <span>{label}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* ── XP Bar ────────────────────────────────── */}
            <div className="sidebar-footer" style={{
                padding: "16px 20px 20px",
                borderTop: "1px solid var(--border)",
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div>
                        <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>
                            Level 7 — Field Agent
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                            2,840 / 5,000 XP
                        </div>
                    </div>
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 28, height: 28,
                        borderRadius: "50%",
                        background: "var(--orange-dim)",
                        color: "var(--orange)",
                        fontWeight: 700, fontSize: "0.72rem",
                    }}>
                        7
                    </div>
                </div>
                <div className="progress-bar">
                    <div className="progress-fill" style={{ width: "56.8%" }} />
                </div>

                {/* OpenRouter balance link */}
                <a
                    href="https://openrouter.ai/credits"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginTop: "12px",
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        transition: "color var(--transition)",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--orange)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                >
                    <DollarSign size={12} />
                    OpenRouter Credits
                </a>
            </div>
        </aside>
    );
}
