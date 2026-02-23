import { VercelRequest, VercelResponse } from "@vercel/node";
import { google } from "googleapis";
import { upsertUser, initMemory } from "../../src/memory-pg.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const code = req.query.code as string;

    if (!code) {
        return res.status(400).send("Missing authorization code");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // Override dynamic host with the explicit production alias to prevent Google mismatch errors
    const redirectUri = "https://gravity-claw-sigma.vercel.app/api/auth/callback";

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Fetch user info from Google
        const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();

        const userId = userInfo.data.id!;
        const email = userInfo.data.email || null;
        const name = userInfo.data.name || null;
        const refreshToken = tokens.refresh_token || null;

        await initMemory();
        // Upsert the user into Supabase to securely attach the refresh token and email
        await upsertUser(userId, email, name, refreshToken);

        // Redirect back to the frontend family portal UI, passing the scoped userId token
        res.redirect(`/?userId=${userId}`);
    } catch (e: any) {
        console.error("OAuth callback error:", e);
        res.status(500).send(`Authentication failed: ${e.message}`);
    }
}
