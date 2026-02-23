import type { Tool } from "./index.js";

export const getCurrentTimeTool: Tool = {
    name: "get_current_time",
    description:
        "Get the current date and time. Optionally specify a timezone (IANA format, e.g. 'America/New_York').",
    inputSchema: {
        type: "object" as const,
        properties: {
            timezone: {
                type: "string",
                description:
                    "IANA timezone identifier (e.g. 'America/New_York', 'Europe/London'). Defaults to the system timezone.",
            },
        },
        required: [],
    },
    execute: async (input) => {
        const tz = (input.timezone as string) || undefined;

        try {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat("en-US", {
                timeZone: tz,
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                timeZoneName: "long",
            });

            return JSON.stringify({
                iso: now.toISOString(),
                formatted: formatter.format(now),
                timezone: tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
                unix: Math.floor(now.getTime() / 1000),
            });
        } catch {
            return JSON.stringify({
                error: `Invalid timezone: "${tz}". Use IANA format (e.g. "America/New_York").`,
            });
        }
    },
};
