/**
 * One-time OAuth2 Token Generator for Google (Gmail, Sheets, Calendar)
 * Run: npx tsx get-google-token.ts
 * Paste the Client ID + Client Secret from Google Cloud Console when prompted.
 * It will open your browser to authorize, then print your REFRESH_TOKEN.
 */

import { google } from "googleapis";
import * as readline from "readline";
import * as http from "http";
import { URL } from "url";
import * as dotenv from "dotenv";
dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file first.");
    process.exit(1);
}

const REDIRECT_URI = "http://localhost:3333/oauth2callback";
const SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/calendar",
];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // forces refresh_token to be returned
});

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  Google OAuth2 Token Generator");
console.log("═══════════════════════════════════════════════════════════");
console.log("\n1. Opening your browser to authorize Google access...");
console.log("   If it doesn't open, visit this URL:\n");
console.log("   " + authUrl + "\n");

// Open the URL in the default browser
const { exec } = await import("child_process");
exec(`start "" "${authUrl}"`);

// Start a local server to catch the redirect
const server = http.createServer(async (req, res) => {
    if (!req.url?.startsWith("/oauth2callback")) return;

    const url = new URL(req.url, REDIRECT_URI);
    const code = url.searchParams.get("code");

    if (!code) {
        res.end("Error: No code in callback.");
        return;
    }

    res.end("<h1>✅ Authorization successful! You can close this tab.</h1>");

    const { tokens } = await oauth2Client.getToken(code);

    console.log("\n✅ SUCCESS! Authorization complete.\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);

    // Auto-save to .env
    const fs = await import("fs");
    let envContent = fs.readFileSync(".env", "utf8");
    if (envContent.includes("GOOGLE_REFRESH_TOKEN=")) {
        envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/g, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    } else {
        envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    }
    fs.writeFileSync(".env", envContent);
    console.log("✅ Automatically saved GOOGLE_REFRESH_TOKEN to .env file!");

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("Then add GOOGLE_REFRESH_TOKEN to Vercel with:");
    console.log(`  vercel env add GOOGLE_REFRESH_TOKEN production`);
    console.log("═══════════════════════════════════════════════════════════\n");

    server.close();
    process.exit(0);
});

server.listen(3333, () => {
    console.log("2. Waiting for authorization on http://localhost:3333 ...\n");
});
