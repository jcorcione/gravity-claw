import fetch from "node-fetch";

const BASEROW_BASE = "https://api.baserow.io/api";

// Your Baserow table IDs
const TABLES = {
    pipeline: 642827,   // Main content pipeline (topic, script, thumbnails, status)
    production: 653165, // Video production (TTS voice, image provider, scenes)
    scenes: 653168,     // Individual scene prompts + images
};

function getToken(): string {
    const token = process.env.BASEROW_API_TOKEN;
    if (!token) throw new Error("BASEROW_API_TOKEN not set.");
    return token;
}

function headers() {
    return {
        "Authorization": `Token ${getToken()}`,
        "Content-Type": "application/json",
    };
}

async function baserowGet(path: string): Promise<any> {
    const res = await fetch(`${BASEROW_BASE}${path}`, { headers: headers() as any });
    if (!res.ok) throw new Error(`Baserow GET error ${res.status}: ${await res.text()}`);
    return res.json();
}

async function baserowPost(path: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${BASEROW_BASE}${path}`, {
        method: "POST",
        headers: headers() as any,
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Baserow POST error ${res.status}: ${await res.text()}`);
    return res.json();
}

async function baserowPatch(path: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${BASEROW_BASE}${path}`, {
        method: "PATCH",
        headers: headers() as any,
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Baserow PATCH error ${res.status}: ${await res.text()}`);
    return res.json();
}

// Valid status values (must match Baserow exactly)
const VALID_STATUSES = ["new", "script_ready", "fact_ok", "seo_ready", "rendering", "rendered", "error"] as const;

export const baserowContentTool = {
    name: "baserow_content",
    description: `Manages the YouTube Shorts content pipeline in Baserow (Table 642827) for @gracenoteinspirations and @gigawerx.

FIELD NAMES (use exactly as shown):
- topic: The video idea or pain point
- script: Full 3-part script (hook + body + CTA)
- title: SEO-optimized YouTube title (60-70 chars)
- description: YouTube video description
- hashtags: Hashtags string e.g. "#shorts #faith #prayer"
- tags: Semicolon-separated tags e.g. "#shorts;faith;prayer"
- thumbnail_1/2/3: Thumbnail prompt text or generated image URL
- selected_thumbnail: Which of the 3 thumbnails was chosen
- filename: Output filename for the video
- mp4_path: Final rendered video URL or local path
- scenes_manifest: JSON string with scene-by-scene breakdown
- channel: "gracenote" or "gigawerx" (single select)
- status: MUST be one of: new, script_ready, fact_ok, seo_ready, rendering, rendered, error

WORKFLOW: new → script_ready → fact_ok → seo_ready → rendering → rendered

ACTIONS:
- list_pending: Get rows with no script yet (status=new or null) — need content generation
- list_all: List all rows, optionally filtered by channel
- create: Add a new video idea (sets status=new automatically)
- update: Write generated content back to a row (script, title, thumbnails, status etc.)
- get_row: Fetch one specific row by ID

TYPICAL FLOW: create row → generate script (youtube_script_generator) → update row with script+status=script_ready → generate 3 thumbnail prompts → comfyui_generate for images → update thumbnail_1/2/3 → elevenlabs_audio for voiceover → update mp4_path + status=rendered`,

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
                type: "number",
                description: "Required for 'update' and 'get_row'. The Baserow row ID."
            },
            topic: {
                type: "string",
                description: "For 'create': The video topic or pain point idea."
            },
            title: {
                type: "string",
                description: "For 'update': SEO-optimized video title."
            },
            script: {
                type: "string",
                description: "For 'update': The full generated script."
            },
            description: {
                type: "string",
                description: "For 'update': Video description for YouTube."
            },
            hashtags: {
                type: "string",
                description: "For 'update': Hashtags for the video (e.g. '#shorts #faith #prayer')."
            },
            thumbnail_1: {
                type: "string",
                description: "For 'update': First thumbnail prompt or image URL."
            },
            thumbnail_2: {
                type: "string",
                description: "For 'update': Second thumbnail concept."
            },
            thumbnail_3: {
                type: "string",
                description: "For 'update': Third thumbnail concept."
            },
            status: {
                type: "string",
                description: "For 'update': Production status e.g. 'Script Ready', 'Rendering', 'Ready to Upload', 'Published'"
            },
            tags: {
                type: "string",
                description: "For 'create'/'update': YouTube tags (semicolon-separated)."
            },
            scenes_manifest: {
                type: "string",
                description: "For 'update': JSON string describing the scene breakdown for this video."
            }
        },
        required: ["action"]
    },
    execute: async (input: Record<string, unknown>) => {
        const action = String(input.action);
        const channel = String(input.channel || "all");

        console.log(`[Tool: baserow_content] Action: ${action}, Channel: ${channel}`);

        try {
            // ─── LIST PENDING ──────────────────────────────────────────────
            if (action === "list_pending") {
                const data = await baserowGet(
                    `/database/rows/table/${TABLES.pipeline}/?user_field_names=true&size=50&order_by=id`
                );
                let rows = data.results.filter((r: any) =>
                    !r.script || r.script === "" || r.status?.value === "new" || r.status === null
                );

                // Filter by channel if Channel field exists
                if (channel !== "all") {
                    rows = rows.filter((r: any) =>
                        !r.Channel || r.Channel?.value === channel
                    );
                }

                return JSON.stringify({
                    count: rows.length,
                    pendingRows: rows.map((r: any) => ({
                        id: r.id,
                        topic: r.topic || r.filename || "(no topic)",
                        channel: r.Channel?.value || "unset",
                        status: r.status?.value || "no status",
                        hasScript: !!r.script,
                        hasTitle: !!r.title,
                        hasThumbnails: !!(r.thumbnail_1 || r.thumbnail_2),
                        createdDate: r.created_date,
                    })),
                    tip: "Use action='update' with a row_id to fill in script, title, thumbnails, etc."
                }, null, 2);
            }

            // ─── LIST ALL ─────────────────────────────────────────────────
            if (action === "list_all") {
                const data = await baserowGet(
                    `/database/rows/table/${TABLES.pipeline}/?user_field_names=true&size=50&order_by=-id`
                );
                let rows = data.results;
                if (channel !== "all") {
                    rows = rows.filter((r: any) => r.Channel?.value === channel);
                }
                return JSON.stringify({
                    total: data.count,
                    showing: rows.length,
                    rows: rows.map((r: any) => ({
                        id: r.id,
                        topic: r.topic || r.filename || "(no topic)",
                        channel: r.Channel?.value || "unset",
                        status: r.status?.value || "no status",
                        title: r.title || null,
                        hasThumbnail: !!(r.thumbnail_1),
                    }))
                }, null, 2);
            }

            // ─── GET ROW ──────────────────────────────────────────────────
            if (action === "get_row") {
                const rowId = Number(input.row_id);
                if (!rowId) return JSON.stringify({ error: "row_id is required for get_row" });
                const row = await baserowGet(
                    `/database/rows/table/${TABLES.pipeline}/${rowId}/?user_field_names=true`
                );
                return JSON.stringify(row, null, 2);
            }

            // ─── CREATE ───────────────────────────────────────────────────
            if (action === "create") {
                if (!input.topic) return JSON.stringify({ error: "topic is required to create a row" });

                // Map channel string to select option value
                const channelSelect = channel === "gracenote"
                    ? { id: null, value: "gracenote" }
                    : channel === "gigawerx"
                        ? { id: null, value: "gigawerx" }
                        : null;

                const body: Record<string, unknown> = {
                    topic: String(input.topic),
                    tags: input.tags ? String(input.tags) : (
                        channel === "gracenote"
                            ? "#shorts;faith;prayer;christian;inspiration"
                            : "#shorts;ai;automation;gigeconomy;freelance"
                    ),
                    created_date: new Date().toISOString().split("T")[0],
                };

                if (channelSelect && channelSelect.value) {
                    body.Channel = channelSelect.value;
                }

                const created = await baserowPost(
                    `/database/rows/table/${TABLES.pipeline}/?user_field_names=true`,
                    body
                );

                return JSON.stringify({
                    success: true,
                    message: `New video idea added to pipeline!`,
                    rowId: created.id,
                    topic: created.topic,
                    channel,
                    nextStep: `Use action='update' with row_id=${created.id} to add the generated script, title, and thumbnail prompts.`
                }, null, 2);
            }

            // ─── UPDATE ───────────────────────────────────────────────────
            if (action === "update") {
                const rowId = Number(input.row_id);
                if (!rowId) return JSON.stringify({ error: "row_id is required for update" });

                const body: Record<string, unknown> = {};
                if (input.title) body.title = input.title;
                if (input.script) body.script = input.script;
                if (input.description) body.description = input.description;
                if (input.hashtags) body.hashtags = input.hashtags;
                if (input.thumbnail_1) body.thumbnail_1 = input.thumbnail_1;
                if (input.thumbnail_2) body.thumbnail_2 = input.thumbnail_2;
                if (input.thumbnail_3) body.thumbnail_3 = input.thumbnail_3;
                if (input.tags) body.tags = input.tags;
                if (input.scenes_manifest) body.scenes_manifest = input.scenes_manifest;
                if (input.status) body.status = input.status;

                const updated = await baserowPatch(
                    `/database/rows/table/${TABLES.pipeline}/${rowId}/?user_field_names=true`,
                    body
                );

                return JSON.stringify({
                    success: true,
                    rowId: updated.id,
                    updatedFields: Object.keys(body),
                    currentStatus: updated.status?.value || input.status || "updated",
                    viewInBaserow: `https://baserow.io/database/274884/table/642827/${rowId}`
                }, null, 2);
            }

            return JSON.stringify({ error: `Unknown action: ${action}` });

        } catch (err: any) {
            return JSON.stringify({ error: err.message, action });
        }
    }
};
