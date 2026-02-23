import type { Tool } from "./index.js";
import { createCalendarEvent, deleteCalendarEvent } from "../calendar.js";

export const manageCalendarTool: Tool = {
    name: "manage_calendar",
    description: "Create or delete events on the user's primary Google Calendar. This is how you set reminders, block off time, schedule calls, etc. Creating an event automatically pushes native notifications to the user.",
    inputSchema: {
        type: "object" as const,
        properties: {
            action: {
                type: "string",
                enum: ["create", "delete"],
                description: "The action to perform.",
            },
            eventId: {
                type: "string",
                description: "The ID of the event to delete (REQUIRED if action='delete').",
            },
            title: {
                type: "string",
                description: "The title/summary of the new event (REQUIRED if action='create').",
            },
            startTime: {
                type: "string",
                description: "The start time of the event in precise ISO 8601 format (e.g., '2026-02-21T15:00:00-05:00') (REQUIRED if action='create').",
            },
            endTime: {
                type: "string",
                description: "The end time of the event in precise ISO 8601 format (e.g., '2026-02-21T16:00:00-05:00') (REQUIRED if action='create').",
            },
            description: {
                type: "string",
                description: "Optional notes or details for the new event.",
            },
        },
        required: ["action"],
    },
    execute: async (input, context) => {
        const action = input.action as string;
        const userId = context?.userId || "default_user";

        try {
            if (action === "create") {
                const title = input.title as string;
                const startTime = input.startTime as string;
                const endTime = input.endTime as string;
                const description = (input.description as string) || "";

                if (!title || !startTime || !endTime) {
                    return "Error: title, startTime, and endTime are required to create an event.";
                }

                // Basic ISO format loose validation to help the LLM fail fast if it messes up
                if (!startTime.includes("T") || !endTime.includes("T")) {
                    return "Error: Start and End times must strictly follow ISO 8601 format (e.g., '2023-10-25T15:30:00-07:00').";
                }

                const link = await createCalendarEvent(title, startTime, endTime, description, userId);
                return `Successfully created event '${title}'.\nLink: ${link}`;

            } else if (action === "delete") {
                const eventId = input.eventId as string;
                if (!eventId) {
                    return "Error: eventId is required to delete an event.";
                }

                await deleteCalendarEvent(eventId, userId);
                return `Successfully deleted event ID ${eventId}.`;

            } else {
                return `Error: Unknown action '${action}'`;
            }

        } catch (error: any) {
            return `Failed to manage Calendar: ${error.message}`;
        }
    },
};
