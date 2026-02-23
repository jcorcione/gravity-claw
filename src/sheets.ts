/**
 * Google Sheets logger for recruiter email drafts.
 * Appends a row to the existing spreadsheet.
 */

import { google } from "googleapis";

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "19SFO3BJAftodeF3hvvj1eLxLRe5g8t76ynywIeMVwoE";

function getSheetsClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error("Missing Google OAuth credentials in environment.");
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    return google.sheets({ version: "v4", auth: oauth2Client });
}

export interface DraftLogRow {
    date: string;
    recruiterName: string;
    recruiterEmail: string;
    company: string;
    role: string;
    coverLetterDraft: string;
    status: string; // "Draft" | "Sent" | "Skipped"
}

/**
 * Append a draft log row to the Google Sheet.
 * Assumes the sheet has headers: Date | Recruiter | Email | Company | Role | Draft | Status
 */
export async function appendDraftLog(row: DraftLogRow): Promise<void> {
    const sheets = getSheetsClient();

    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "Sheet1!A:G",
        valueInputOption: "RAW",
        requestBody: {
            values: [[
                row.date,
                row.recruiterName,
                row.recruiterEmail,
                row.company,
                row.role,
                row.coverLetterDraft,
                row.status,
            ]],
        },
    });
}

/**
 * Ensure the sheet has headers on first run
 */
export async function ensureSheetHeaders(): Promise<void> {
    const sheets = getSheetsClient();

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Sheet1!A1:G1",
    });

    const firstRow = res.data.values?.[0] || [];
    if (firstRow.length === 0) {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: "Sheet1!A1:G1",
            valueInputOption: "RAW",
            requestBody: {
                values: [["Date", "Recruiter Name", "Recruiter Email", "Company", "Role/Position", "Cover Letter Draft", "Status"]],
            },
        });
    }
}
