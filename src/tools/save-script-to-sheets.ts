import { google } from "googleapis";
import type { Tool } from "./index.js";

// Uses the existing OAuth setup from the workspace
function getOAuth2Client() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error("Missing one or more Google API credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN) in environment variables.");
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, "https://developers.google.com/oauthplayground");
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
}

export const saveScriptToSheetsTool: Tool = {
    name: "save_script_to_sheets",
    description: `Saves a generated video script and its metadata to the Google Sheets Video Pipeline tracker.
This is the final step in the content generation loop. Once the script and thumbnail prompt are written, ALWAYS use this tool to save it. N8N orchestrator will automatically pick it up for rendering.`,
    inputSchema: {
        type: "object",
        properties: {
            items: {
                type: "array",
                description: "Array of video scripts to save.",
                items: {
                    type: "object",
                    properties: {
                        channel: { type: "string", description: "e.g., gracenote or gigawerx" },
                        topic: { type: "string" },
                        title: { type: "string" },
                        hook: { type: "string" },
                        main_script: { type: "string" },
                        cta: { type: "string" },
                        thumbnail_prompt: { type: "string", description: "Detailed 1-sentence prompt for the ComfyUI thumbnail generation (e.g. 'A dark moody cross at sunset, golden hour lighting'). Do NOT include negative prompts here." }
                    },
                    required: ["channel", "topic", "title", "hook", "main_script", "cta", "thumbnail_prompt"]
                }
            }
        },
        required: ["items"]
    },
    execute: async (input) => {
        const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        if (!spreadsheetId) {
            return "Error: GOOGLE_SHEETS_SPREADSHEET_ID is not set in environment.";
        }
        
        try {
            const auth = getOAuth2Client();
            const sheets = google.sheets({ version: "v4", auth });

            const items = input.items as any[];
            const timestamp = new Date().toISOString();

            // Headers: Timestamp | Channel | Topic | Title | Hook | Script | CTA | Thumbnail Prompt | Voice | Status | Video Path
            const values = items.map(item => {
                const voice = item.channel === "gigawerx" ? "male_01.wav" : "female_01.wav";
                return [
                    timestamp,
                    item.channel,
                    item.topic,
                    item.title,
                    item.hook,
                    item.main_script,
                    item.cta,
                    item.thumbnail_prompt,
                    voice,
                    "Pending",
                    "" // Video Path will be filled by N8N
                ];
            });

            // Dynamically fetch the real tab name — avoids "Sheet1" breaking on renamed tabs
            const meta = await sheets.spreadsheets.get({ spreadsheetId });
            const firstSheetName = meta.data.sheets?.[0]?.properties?.title ?? "Sheet1";

            const response = await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `'${firstSheetName}'!A:K`, // Appends to the first available row
                valueInputOption: "USER_ENTERED",
                requestBody: {
                    values
                }
            });
            
            return `✅ Successfully saved ${items.length} video script(s) directly to Google Sheets! Pipeline Row Updated: ${response.data.updates?.updatedRange}. Status set to 'Pending' for N8N rendering.`;
        } catch (error: any) {
            return `Error saving to Google Sheets: ${error.message}`;
        }
    }
};
