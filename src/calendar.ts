import { google } from "googleapis";
import { getUser } from "./memory-pg.js";

async function getCalendarClient(userId: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // First, try to get the token from the DB for this user
    let refreshToken = null;
    try {
        const user = await getUser(userId);
        if (user && user.google_refresh_token) {
            refreshToken = user.google_refresh_token;
        }
    } catch (e) {
        // Ignore DB errors and fall back
    }

    // Fallback to the environment variable for legacy/local testing
    if (!refreshToken) {
        refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    }

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error(`Calendar API not configured for user ${userId}. They need to sign in with Google.`);
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, "http://localhost:3333/oauth2callback");
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    return google.calendar({ version: "v3", auth: oauth2Client });
}

export interface CalendarEvent {
    id: string;
    summary: string;
    description?: string;
    startTime: string;
    endTime: string;
    link?: string;
}

/**
 * Get upcoming events from the primary calendar.
 */
export async function getCalendarEvents(timeMin: Date = new Date(), maxResults: number = 10, userId: string = "default_user"): Promise<CalendarEvent[]> {
    const calendar = await getCalendarClient(userId);

    // Default to searching the next 30 days if no timeMax is provided by the logic later
    const timeMax = new Date(timeMin.getTime() + 30 * 24 * 60 * 60 * 1000);

    const res = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
    });

    const items = res.data.items || [];

    return items.map(item => ({
        id: item.id!,
        summary: item.summary || "Untitled Event",
        description: item.description || "",
        startTime: item.start?.dateTime || item.start?.date || "",
        endTime: item.end?.dateTime || item.end?.date || "",
        link: item.htmlLink || "",
    }));
}

/**
 * Creates a new event on the primary calendar.
 * Dates must be ISO strings.
 */
export async function createCalendarEvent(title: string, startTime: string, endTime: string, description: string = "", userId: string = "default_user"): Promise<string> {
    const calendar = await getCalendarClient(userId);

    const res = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
            summary: title,
            description,
            start: { dateTime: startTime },
            end: { dateTime: endTime },
        },
    });

    return res.data.htmlLink || "No link generated";
}

/**
 * Deletes an event from the primary calendar.
 */
export async function deleteCalendarEvent(eventId: string, userId: string = "default_user"): Promise<void> {
    const calendar = await getCalendarClient(userId);

    await calendar.events.delete({
        calendarId: "primary",
        eventId,
    });
}
