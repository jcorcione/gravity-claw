"use client";

import { useState } from "react";
import { Save, Check, Eye, EyeOff } from "lucide-react";

interface ConfigRow {
    key: string;
    label: string;
    value: string;
    sensitive?: boolean;
    editable?: boolean;
}

const CONFIGS: ConfigRow[] = [
    { key: "LLM_MODEL", label: "LLM Model", value: "anthropic/claude-sonnet-4", editable: true },
    { key: "LLM_MAX_TOKENS", label: "Max Response Tokens", value: "4096", editable: true },
    { key: "MAX_AGENT_ITERATIONS", label: "Max Agent Iterations", value: "10", editable: true },
    { key: "HEARTBEAT_MORNING_CRON", label: "Morning Briefing Cron", value: "0 8 * * *", editable: true },
    { key: "TELEGRAM_BOT_TOKEN", label: "Telegram Bot Token", value: "870xxx...123", sensitive: true },
    { key: "DISCORD_BOT_TOKEN", label: "Discord Bot Token", value: "MTQ3...WoA", sensitive: true },
    { key: "OPENROUTER_API_KEY", label: "OpenRouter API Key", value: "sk-or-...xyz", sensitive: true },
    { key: "ALLOWED_USER_IDS", label: "Allowed Telegram User IDs", value: "6329835901" },
    { key: "GOOGLE_SHEETS_SPREADSHEET_ID", label: "Recruiter Sheet ID", value: "19SFO3BJAft...woE" },
];

export default function SettingsPage() {
    const [systemPrompt, setSystemPrompt] = useState(
        `You are Nexus, a highly capable personal AI assistant for John Corcione.

You are intelligent, direct, and proactive. You have access to tools including:
- Email scanning and cover letter generation
- Google Calendar management
- Web search and SEO analysis
- Shell access for system diagnostics
- Memory tools (Supabase + Pinecone)
- OpenRouter balance monitoring

Always be concise, helpful, and action-oriented. When uncertain, use your tools to find the answer rather than guessing.`
    );
    const [saved, setSaved] = useState(false);
    const [revealed, setRevealed] = useState<Set<string>>(new Set());
    const [configs, setConfigs] = useState<ConfigRow[]>(CONFIGS);

    const savePrompt = () => {
        // In production: POST to /api/action to save to Supabase bot_config
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    const toggleReveal = (key: string) => {
        setRevealed(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    return (
        <>
            <div className="page-header fade-in">
                <h1>Settings</h1>
                <p>Agent personality, model configuration, and environment</p>
            </div>

            {/* System Prompt */}
            <div className="card fade-in fade-in-1" style={{ marginBottom: 20 }}>
                <div className="card-header">
                    <div>
                        <div className="card-title">Personality & System Prompt</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                            This defines Nexus&apos;s behavior and persona
                        </div>
                    </div>
                    <button
                        className={`btn ${saved ? "btn-secondary" : "btn-primary"}`}
                        onClick={savePrompt}
                        style={{ gap: 6 }}
                    >
                        {saved ? <Check size={14} /> : <Save size={14} />}
                        {saved ? "Saved!" : "Save Prompt"}
                    </button>
                </div>
                <textarea
                    className="input textarea"
                    style={{ minHeight: 200, fontFamily: "JetBrains Mono, monospace", fontSize: "0.8rem", lineHeight: 1.65 }}
                    value={systemPrompt}
                    onChange={e => setSystemPrompt(e.target.value)}
                />
            </div>

            {/* Config entries */}
            <div className="section-divider fade-in">Environment Variables</div>

            <div className="card fade-in fade-in-3">
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {configs.map((cfg, i) => (
                        <div key={cfg.key} style={{
                            display: "grid",
                            gridTemplateColumns: "220px 1fr auto",
                            gap: 16,
                            padding: "14px 0",
                            borderBottom: i < configs.length - 1 ? "1px solid var(--border)" : "none",
                            alignItems: "center",
                        }}>
                            <div>
                                <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{cfg.label}</div>
                                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{cfg.key}</div>
                            </div>
                            {cfg.editable ? (
                                <input
                                    className="input"
                                    style={{ fontSize: "0.82rem", padding: "6px 10px" }}
                                    defaultValue={cfg.value}
                                />
                            ) : (
                                <span style={{
                                    fontSize: "0.82rem",
                                    fontFamily: "JetBrains Mono, monospace",
                                    color: cfg.sensitive ? "var(--text-muted)" : "var(--text-primary)",
                                }}>
                                    {cfg.sensitive && !revealed.has(cfg.key)
                                        ? "●".repeat(Math.min(cfg.value.length, 20))
                                        : cfg.value}
                                </span>
                            )}
                            {cfg.sensitive && (
                                <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={() => toggleReveal(cfg.key)}>
                                    {revealed.has(cfg.key) ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                            )}
                            {!cfg.sensitive && <div />}
                        </div>
                    ))}
                </div>
            </div>

            {/* Danger Zone */}
            <div className="section-divider fade-in" style={{ color: "var(--red)" }}>Danger Zone</div>
            <div className="card fade-in" style={{ borderColor: "rgba(217,85,85,0.2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>Clear All Memories</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            This will delete all messages from Supabase. Pinecone vectors require manual deletion.
                        </div>
                    </div>
                    <button className="btn btn-danger">Clear Memory</button>
                </div>
            </div>
        </>
    );
}
