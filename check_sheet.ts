import { google } from "googleapis";
import * as dotenv from "dotenv";
dotenv.config();

function getOAuth2Client() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, "https://developers.google.com/oauthplayground");
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
}

async function checkSheet() {
    console.log("Checking the new Google Sheet for data...");
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    try {
        const auth = getOAuth2Client();
        const sheets = google.sheets({ version: "v4", auth });

        const metaResponse = await sheets.spreadsheets.get({
            spreadsheetId
        });
        const firstSheetName = metaResponse.data.sheets?.[0]?.properties?.title || "Sheet1";
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${firstSheetName}'!A:K`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            console.log("Sheet is completely empty! No data found.");
        } else {
            console.log(`Found ${rows.length} rows in the sheet.`);
            console.log("--- Header ---");
            console.log(rows[0].join(" | "));
            console.log("--------------");
            if (rows.length > 1) {
                console.log("--- Latest Entry ---");
                console.log(rows[rows.length - 1].join(" | "));
            }
        }
    } catch (error: any) {
        console.error("Error reading from Google Sheets:", error.message);
    }
}

checkSheet();
