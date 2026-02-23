import type { Tool } from "./index.js";
import { getCalendarEvents } from "../calendar.js";

export const searchCalendarTool: Tool = {
    name: "search_calendar",
    description: "Search the user's primary Google Calendar for upcoming events. Returns event IDs, titles, start times, and end times.",
    inputSchema: {
        type: "object" as const,
        properties: {
            daysAhead: {
                type: "number",
                description: "Number of days ahead to search (default 30). Use smaller numbers like 1 or 7 for 'today' or 'this week'.",
            },
            maxResults: {
                type: "number",
                description: "Maximum number of events to return (default 10, max 20).",
            },
        },
        // No required fields
    },
    execute: async (input, context) => {
        const timeMin = new Date();
        const daysAhead = (input.daysAhead as number) || 30;
        const maxResults = Math.min((input.maxResults as number) || 10, 20);
        const userId = context?.userId || "default_user";

        try {
            const events = await getCalendarEvents(timeMin, maxResults, userId);

            // Filter by daysAhead manually if needed since the API doesn't let us cleanly specify "next X days" in list query without timeMax
            const cutoff = new Date(timeMin.getTime() + daysAhead * 24 * 60 * 60 * 1000);
            const filtered = events.filter(e => new Date(e.startTime) <= cutoff);

            if (filtered.length === 0) {
                return `No upcoming events found in the next ${daysAhead} days.`;
            }

            let result = `Found ${filtered.length} events in the next ${daysAhead} days:\n\n`;
            for (const event of filtered) {
                result += `ID: ${event.id}\nTitle: ${event.summary}\nStart: ${event.startTime}\nEnd: ${event.endTime}\nDescription: ${event.description}\nLink: ${event.link}\n---\n`;
            }

            return result;
        } catch (error: any) {
            return `Failed to search Calendar: ${error.message}`;
        }
    },
};
