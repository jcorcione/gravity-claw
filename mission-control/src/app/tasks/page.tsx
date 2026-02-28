"use client";

import { useState } from "react";
import { Mail, FileText, Briefcase, Calendar, Zap } from "lucide-react";

interface RecruiterEntry {
    company: string;
    role: string;
    recruiter: string;
    email: string;
    date: string;
    status: "Draft" | "Sent" | "Interview" | "Rejected";
}

// Static demo data — in production this would come from Google Sheets API
const MOCK_RECRUITER: RecruiterEntry[] = [
    { company: "Acme Corp", role: "Senior Frontend Engineer", recruiter: "Jane Smith", email: "jane@acme.com", date: "2026-02-27", status: "Draft" },
    { company: "TechScale", role: "Full Stack Developer", recruiter: "Mike Johnson", email: "mike@techscale.io", date: "2026-02-26", status: "Draft" },
    { company: "StartupXYZ", role: "Lead React Engineer", recruiter: "Sarah Chen", email: "s.chen@startup.co", date: "2026-02-25", status: "Sent" },
    { company: "BigTechCo", role: "Principal Engineer", recruiter: "David Lee", email: "d.lee@bigtech.com", date: "2026-02-24", status: "Interview" },
];

const STATUS_BADGE: Record<string, string> = {
    Draft: "badge-blue",
    Sent: "badge-orange",
    Interview: "badge-green",
    Rejected: "badge-red",
};

type Tab = "recruiter" | "agent";

export default function TasksPage() {
    const [tab, setTab] = useState<Tab>("recruiter");

    return (
        <>
            <div className="page-header fade-in">
                <h1>Tasks</h1>
                <p>Recruiter pipeline and agent activity log</p>
            </div>

            {/* Stat cards */}
            <div className="stat-grid fade-in fade-in-1" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                {[
                    { label: "Total Pipeline", value: `${MOCK_RECRUITER.length}`, color: "blue", Icon: Briefcase },
                    { label: "Drafts Ready", value: `${MOCK_RECRUITER.filter(r => r.status === "Draft").length}`, color: "orange", Icon: FileText },
                    { label: "Interviews", value: `${MOCK_RECRUITER.filter(r => r.status === "Interview").length}`, color: "green", Icon: Calendar },
                    { label: "Emails Sent", value: `${MOCK_RECRUITER.filter(r => r.status === "Sent").length}`, color: "purple", Icon: Mail },
                ].map(({ label, value, color, Icon }, i) => (
                    <div key={label} className={`stat-card ${color} fade-in fade-in-${i + 1}`}>
                        <div className={`stat-icon ${color}`}><Icon size={16} /></div>
                        <div className="stat-value">{value}</div>
                        <div className="stat-label">{label}</div>
                    </div>
                ))}
            </div>

            <div className="tabs fade-in fade-in-3">
                <button className={`tab ${tab === "recruiter" ? "active" : ""}`} onClick={() => setTab("recruiter")}>
                    Recruiter Pipeline
                </button>
                <button className={`tab ${tab === "agent" ? "active" : ""}`} onClick={() => setTab("agent")}>
                    Automation Jobs
                </button>
            </div>

            {tab === "recruiter" ? (
                <div className="card fade-in fade-in-4">
                    <div className="card-header">
                        <div className="card-title">Recruiter Cover Letter Drafts</div>
                        <span className="badge badge-gray">Synced from Google Sheets</span>
                    </div>
                    {MOCK_RECRUITER.length === 0 ? (
                        <p style={{ color: "var(--text-muted)", padding: "20px 0" }}>
                            No recruiter emails processed yet. Run the Email Scan from the Command Center.
                        </p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                            {/* Table header */}
                            <div style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1.2fr 1fr 1fr auto",
                                gap: 16,
                                padding: "8px 12px",
                                fontSize: "0.72rem",
                                color: "var(--text-muted)",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                borderBottom: "1px solid var(--border)",
                            }}>
                                <span>Company</span><span>Role</span><span>Recruiter</span><span>Date</span><span>Status</span>
                            </div>

                            {MOCK_RECRUITER.map((entry, i) => (
                                <div key={i} style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1.2fr 1fr 1fr auto",
                                    gap: 16,
                                    padding: "14px 12px",
                                    borderBottom: "1px solid var(--border)",
                                    fontSize: "0.84rem",
                                    alignItems: "center",
                                    transition: "background var(--transition)",
                                    cursor: "pointer",
                                }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                >
                                    <span style={{ fontWeight: 600 }}>{entry.company}</span>
                                    <span style={{ color: "var(--text-secondary)" }}>{entry.role}</span>
                                    <span style={{ color: "var(--text-secondary)" }}>{entry.recruiter}</span>
                                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.75rem", color: "var(--text-muted)" }}>{entry.date}</span>
                                    <span className={`badge ${STATUS_BADGE[entry.status]}`}>{entry.status}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {[
                        { name: "Morning Briefing", schedule: "0 8 * * *", status: "active", last: "Today 8:00 AM" },
                        { name: "Recruiter Email Scan", schedule: "30 14 * * 1-5", status: "active", last: "Yesterday 2:30 PM" },
                        { name: "Email Scan (Evening)", schedule: "0 20 * * 1-5", status: "active", last: "Yesterday 8:00 PM" },
                        { name: "Smart Recommendations", schedule: "0 22 * * 1-5", status: "active", last: "Yesterday 10:00 PM" },
                    ].map((job, i) => (
                        <div key={job.name} className={`card fade-in fade-in-${i + 2}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                <div className="stat-icon orange" style={{ margin: 0 }}><Zap size={14} /></div>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{job.name}</div>
                                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>
                                        cron: {job.schedule}
                                    </div>
                                </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <span className="badge badge-green" style={{ marginBottom: 4, display: "block" }}>{job.status}</span>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Last: {job.last}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
