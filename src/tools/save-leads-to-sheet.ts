/**
 * save-leads-to-sheet.ts
 * Creates a new Google Sheet in the user's Drive and writes structured lead data to it.
 * Uses the existing Google OAuth credentials from the environment.
 */

import { google } from "googleapis";

function getGoogleClients() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error("Missing Google OAuth credentials in environment.");
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    return {
        sheets: google.sheets({ version: "v4", auth: oauth2Client }),
        drive:  google.drive({ version: "v3",  auth: oauth2Client }),
    };
}

export interface LeadRow {
    businessName: string;
    businessType: string;
    phone?: string;
    address?: string;
    currentOnlinePresence: string;
    whyGoodFit: string;
    sourceUrl?: string;
}

/**
 * Creates a new Google Sheet with the given title, writes the lead list, and returns the URL.
 */
export async function createLeadsSheet(title: string, leads: LeadRow[]): Promise<string> {
    const { sheets, drive } = getGoogleClients();

    // 1. Create a new blank spreadsheet
    const createRes = await sheets.spreadsheets.create({
        requestBody: {
            properties: { title },
            sheets: [{
                properties: { title: "Leads", gridProperties: { frozenRowCount: 1 } }
            }]
        }
    });

    const spreadsheetId = createRes.data.spreadsheetId!;
    const spreadsheetUrl = createRes.data.spreadsheetUrl!;

    // 2. Write headers + data
    const headers = [
        "Business Name", "Type / Industry", "Phone", "Address",
        "Current Online Presence", "Why Good Fit for Delcor Media", "Source URL", "Date Added"
    ];

    const rows = leads.map(l => [
        l.businessName,
        l.businessType,
        l.phone ?? "",
        l.address ?? "",
        l.currentOnlinePresence,
        l.whyGoodFit,
        l.sourceUrl ?? "",
        new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" })
    ]);

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Leads!A1",
        valueInputOption: "RAW",
        requestBody: { values: [headers, ...rows] }
    });

    // 3. Bold the header row
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [{
                repeatCell: {
                    range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
                    cell: { userEnteredFormat: { textFormat: { bold: true } } },
                    fields: "userEnteredFormat.textFormat.bold"
                }
            }, {
                autoResizeDimensions: {
                    dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: 8 }
                }
            }]
        }
    });

    // 4. Make the sheet accessible to anyone with the link (view only)
    await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: { role: "reader", type: "anyone" }
    });

    return spreadsheetUrl;
}

// ─── Tool Definition ─────────────────────────────────────

export const saveLeadsToSheetTool = {
    name: "save_leads_to_sheet",
    description: `Creates a new Google Sheet in John's Google Drive and saves a structured list of business leads to it. 
Use this after gathering leads from a search. 
The 'leads' parameter is a JSON array of lead objects. Each object must have: businessName, businessType, currentOnlinePresence, whyGoodFit. 
Optional fields: phone, address, sourceUrl.
Returns the URL of the newly created Google Sheet.`,
    inputSchema: {
        type: "object",
        properties: {
            sheetTitle: {
                type: "string",
                description: "Title for the Google Sheet, e.g. 'Clearwater FL Lead Gen — May 2026'"
            },
            leads: {
                type: "array",
                description: "Array of lead objects to write to the sheet.",
                items: {
                    type: "object",
                    properties: {
                        businessName:           { type: "string" },
                        businessType:           { type: "string" },
                        phone:                  { type: "string" },
                        address:                { type: "string" },
                        currentOnlinePresence:  { type: "string" },
                        whyGoodFit:             { type: "string" },
                        sourceUrl:              { type: "string" }
                    },
                    required: ["businessName", "businessType", "currentOnlinePresence", "whyGoodFit"]
                }
            }
        },
        required: ["sheetTitle", "leads"]
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
        const title  = String(input.sheetTitle ?? "Lead Gen Results");
        const leads  = input.leads as LeadRow[];

        if (!Array.isArray(leads) || leads.length === 0) {
            return "Error: 'leads' must be a non-empty array of lead objects.";
        }

        console.log(`[Tool: save_leads_to_sheet] Creating sheet "${title}" with ${leads.length} leads...`);

        try {
            const url = await createLeadsSheet(title, leads);
            return `✅ Google Sheet created with ${leads.length} leads!\n📊 Open here: ${url}`;
        } catch (err: any) {
            console.error("[save_leads_to_sheet] Error:", err);
            return `Error creating Google Sheet: ${err.message}`;
        }
    }
};
