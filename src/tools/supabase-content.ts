import postgres from "postgres";
import type { Tool } from "./index.js";

// Initialize Postgres client using the Supabase DB URL
function getDb() {
    const dbUrl = process.env.SUPABASE_DB_URL;
    if (!dbUrl) {
        throw new Error("Missing SUPABASE_DB_URL environment variable.");
    }
    return postgres(dbUrl, { ssl: "require" });
}

export const supabaseContentTool: Tool = {
    name: "supabase_content",
    description: `Manages the YouTube Shorts content pipeline in the Supabase 'videos' table.

FIELD NAMES (use exactly as shown):
- topic: The video idea or pain point
- script: Full script text
- title: SEO-optimized YouTube title
- description: YouTube video description
- hashtags: Hashtags string e.g. "#shorts #faith #prayer"
- tags: Semicolon-separated tags e.g. "#shorts;faith;prayer"
- video_filepath: Final rendered video URL or local path
- channel: "gracenote" or "gigawerx" (single select)
- status: MUST be one of: rendered, published, error

WORKFLOW: rendered → published

ACTIONS:
- list_pending: Get rows that are not published yet
- list_all: List all rows, optionally filtered by channel
- create: Add a new video record (optionally passes full metadata immediately after \`create_short_video\` finishes)
- update: Update a row (e.g. status to 'published')
- get_row: Fetch one specific row by ID`,
    inputSchema: {
        type: "object",
        properties: {
            action: {
                type: "string",
                enum: ["list_pending", "list_all", "create", "update", "get_row"],
                description: "What to do with the content pipeline"
            },
            channel: {
                type: "string",
                enum: ["gracenote", "gigawerx", "all"],
                description: "Filter by channel. Used with list_pending and list_all."
            },
            row_id: {
                type: "string",
                description: "Required for 'update' and 'get_row'. The Supabase UUID."
            },
            topic: { type: "string" },
            title: { type: "string" },
            script: { type: "string" },
            description: { type: "string" },
            hashtags: { type: "string" },
            video_filepath: { type: "string" },
            status: { type: "string" },
            tags: { type: "string" }
        },
        required: ["action"]
    },
    execute: async (input) => {
        const action = String(input.action);
        const channel = String(input.channel || "all");
        let sql;

        try {
            sql = getDb();

            if (action === "list_pending") {
                let rows;
                if (channel !== "all") {
                    rows = await sql`SELECT id, topic, channel, status, script, title, created_at FROM videos WHERE status != 'published' AND channel = ${channel} ORDER BY created_at DESC LIMIT 50`;
                } else {
                    rows = await sql`SELECT id, topic, channel, status, script, title, created_at FROM videos WHERE status != 'published' ORDER BY created_at DESC LIMIT 50`;
                }

                return JSON.stringify({
                    count: rows.length,
                    pendingRows: rows.map(r => ({
                        id: r.id,
                        topic: r.topic || "(no topic)",
                        channel: r.channel || "unset",
                        status: r.status || "no status",
                        hasScript: !!r.script,
                        hasTitle: !!r.title,
                        createdAt: r.created_at,
                    })),
                    tip: "Use action='update' with a row_id to update the status to 'published' after uploading."
                }, null, 2);
            }

            if (action === "list_all") {
                let rows;
                if (channel !== "all") {
                    rows = await sql`SELECT id, topic, channel, status, title, created_at FROM videos WHERE channel = ${channel} ORDER BY created_at DESC LIMIT 50`;
                } else {
                    rows = await sql`SELECT id, topic, channel, status, title, created_at FROM videos ORDER BY created_at DESC LIMIT 50`;
                }
                return JSON.stringify({ count: rows.length, rows }, null, 2);
            }

            if (action === "get_row") {
                const rowId = input.row_id as string;
                if (!rowId) return JSON.stringify({ error: "row_id is required" });
                const rows = await sql`SELECT * FROM videos WHERE id = ${rowId} LIMIT 1`;
                return JSON.stringify(rows[0] || { error: "Not found" }, null, 2);
            }

            if (action === "create") {
                if (!input.topic) return JSON.stringify({ error: "topic is required" });

                const tags = input.tags ? String(input.tags) : (channel === "gracenote" ? "#shorts;faith;prayer" : "#shorts;tech");

                const rows = await sql`
                    INSERT INTO videos (
                        topic, tags, channel, title, script, description, hashtags, video_filepath, status
                    ) VALUES (
                        ${input.topic ? String(input.topic) : null}, ${tags}, ${channel !== "all" ? channel : null}, 
                        ${input.title ? String(input.title) : null}, ${input.script ? String(input.script) : null}, ${input.description ? String(input.description) : null}, 
                        ${input.hashtags ? String(input.hashtags) : null}, ${input.video_filepath ? String(input.video_filepath) : null}, ${input.status ? String(input.status) : 'rendered'}
                    ) RETURNING id, topic, channel
                `;

                return JSON.stringify({ success: true, message: "New video recorded in Supabase!", row: rows[0] }, null, 2);
            }

            if (action === "update") {
                const rowId = input.row_id as string;
                if (!rowId) return JSON.stringify({ error: "row_id is required for update" });

                // Construct dynamic update
                const updates: any = {};
                for (const k of ["title", "script", "description", "hashtags", "tags", "video_filepath", "status"]) {
                    if (input[k] !== undefined) updates[k] = input[k];
                }

                if (Object.keys(updates).length > 0) {
                    const rows = await sql`UPDATE videos set ${sql(updates, Object.keys(updates))} WHERE id = ${rowId} RETURNING id, status`;
                    return JSON.stringify({ success: true, updatedFields: Object.keys(updates), row: rows[0] }, null, 2);
                }
                return JSON.stringify({ error: "No fields to update provided" });
            }

            return JSON.stringify({ error: `Unknown action: ${action}` });

        } catch (err: any) {
            return JSON.stringify({ error: err.message, action });
        } finally {
            if (sql) await sql.end();
        }
    }
};
