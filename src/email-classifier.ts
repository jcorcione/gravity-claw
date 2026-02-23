/**
 * Email classifier: determines if an email is from a human recruiter,
 * a job board (automated), or irrelevant.
 */

export interface EmailSummary {
    id: string;
    threadId: string;
    from: string;
    fromEmail: string;
    subject: string;
    snippet: string;
    body: string;
    date: string;
}

// Known job board domains and sender patterns
const JOB_BOARD_DOMAINS = [
    "indeed.com", "linkedin.com", "ziprecruiter.com", "glassdoor.com",
    "monster.com", "dice.com", "careerbuilder.com", "simplyhired.com",
    "lever.co", "greenhouse.io", "workday.com", "icims.com", "taleo.net",
    "jobvite.com", "smartrecruiters.com", "myworkdayjobs.com", "jobs.com",
    "handshake.com", "wellfound.com", "builtin.com"
];

// Job board keyword patterns in subject
const JOB_BOARD_SUBJECT_PATTERNS = [
    /new job alert/i, /jobs you might like/i, /recommended jobs/i,
    /job matches/i, /salary insights/i, /apply now/i, /jobs near you/i,
    /people are looking at your profile/i, /^\d+ new jobs/i
];

// Recruiter keywords — strong signals a human wrote this
const RECRUITER_KEYWORDS = [
    "recruiter", "talent acquisition", "hiring manager", "staffing",
    "i came across your profile", "i found your background",
    "i'd love to connect", "we have an opening", "we're looking for",
    "your experience", "your background", "your linkedin",
    "reach out", "schedule a call", "quick chat"
];

export type EmailCategory = "recruiter" | "job-board" | "other";

export interface ClassificationResult {
    category: EmailCategory;
    confidence: "high" | "low";
    reason: string;
}

/**
 * Classify an email using heuristics first, LLM as fallback.
 */
export function classifyEmail(email: EmailSummary): ClassificationResult {
    const domain = email.fromEmail.split("@")[1]?.toLowerCase() || "";
    const subjectLower = email.subject.toLowerCase();
    const bodyLower = (email.body + " " + email.snippet).toLowerCase();

    // 1. Check domain against known job boards
    if (JOB_BOARD_DOMAINS.some(d => domain.includes(d))) {
        return { category: "job-board", confidence: "high", reason: `Known job board domain: ${domain}` };
    }

    // 2. Check subject patterns
    if (JOB_BOARD_SUBJECT_PATTERNS.some(p => p.test(email.subject))) {
        return { category: "job-board", confidence: "high", reason: "Subject matches job board pattern" };
    }

    // 3. Check for recruiter keywords in body
    const recruiterHits = RECRUITER_KEYWORDS.filter(kw => bodyLower.includes(kw));
    if (recruiterHits.length >= 2) {
        return { category: "recruiter", confidence: "high", reason: `Keywords: ${recruiterHits.slice(0, 3).join(", ")}` };
    }

    // 4. Single keyword hit — lower confidence recruiter
    if (recruiterHits.length === 1) {
        return { category: "recruiter", confidence: "low", reason: `Weak keyword match: ${recruiterHits[0]}` };
    }

    // 5. No match
    return { category: "other", confidence: "high", reason: "No recruiter or job-board signals found" };
}

/**
 * Extract company and role from email content
 */
export function extractJobDetails(email: EmailSummary): { company: string; role: string; recruiterName: string } {
    // Try to extract name from "From" header (e.g. "John Smith <john@company.com>")
    const recruiterName = email.from.replace(/<.*>/, "").trim().replace(/"/g, "") || "Unknown Recruiter";

    // Try to guess company from domain
    const domain = email.fromEmail.split("@")[1] || "";
    const company = domain.split(".")[0] || "Unknown Company";

    // Try to extract role from subject (common patterns)
    const roleMatch = email.subject.match(/(?:for|role:|position:|opening:?|opportunity:?)\s+(.+?)(?:\s+at\s+|\s*$)/i);
    const role = roleMatch?.[1]?.trim() || email.subject.slice(0, 80) || "Unknown Role";

    return { company, role, recruiterName };
}
