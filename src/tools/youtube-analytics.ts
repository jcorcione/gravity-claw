import fetch from "node-fetch";

// Channel handle → Channel ID mapping for your two channels
// IDs are resolved at runtime if not hardcoded
const KNOWN_CHANNELS: Record<string, string> = {
    "gracenoteinspriations": "UCgracenoteinspriations", // will be resolved dynamically
    "gigawerx": "UCgigawerx",
};

function getApiKey(): string {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) throw new Error("YOUTUBE_API_KEY is not set in environment variables.");
    return key;
}

async function resolveChannelId(handleOrQuery: string): Promise<{ id: string; title: string; handle: string }> {
    const apiKey = getApiKey();
    // Try handle-based lookup first (@handle format)
    const handle = handleOrQuery.replace(/^@/, "");
    const url = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json() as any;

    if (data.items && data.items.length > 0) {
        const ch = data.items[0];
        return { id: ch.id, title: ch.snippet.title, handle: ch.snippet.customUrl || handle };
    }

    // Fallback: search query
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(handleOrQuery)}&maxResults=1&key=${apiKey}`;
    const sRes = await fetch(searchUrl);
    const sData = await sRes.json() as any;
    if (sData.items && sData.items.length > 0) {
        const ch = sData.items[0];
        return { id: ch.id.channelId, title: ch.snippet.channelTitle, handle: handleOrQuery };
    }

    throw new Error(`Could not resolve channel for: ${handleOrQuery}`);
}

async function getChannelStats(channelId: string): Promise<any> {
    const apiKey = getApiKey();
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics,brandingSettings,snippet&id=${channelId}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json() as any;
    if (!data.items || data.items.length === 0) throw new Error(`No stats found for channel ${channelId}`);
    return data.items[0];
}

async function getTopVideos(channelId: string, maxResults = 10, type: "all" | "shorts" = "all"): Promise<any[]> {
    const apiKey = getApiKey();
    // Get uploads playlist ID
    const chRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`);
    const chData = await chRes.json() as any;
    const uploadsPlaylistId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) throw new Error("Could not get uploads playlist.");

    // Get recent videos from uploads
    const plRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&key=${apiKey}`);
    const plData = await plRes.json() as any;
    const videoIds = plData.items?.map((i: any) => i.contentDetails.videoId).join(",") || "";

    if (!videoIds) return [];

    // Get video details including duration (Shorts = < 60s)
    const vidRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${apiKey}`);
    const vidData = await vidRes.json() as any;

    let videos = vidData.items || [];

    if (type === "shorts") {
        // Filter to videos under 60 seconds (ISO 8601 duration PT1M = 60s)
        videos = videos.filter((v: any) => {
            const dur = v.contentDetails?.duration || "";
            // Parse ISO 8601: PT30S, PT1M, PT1M30S etc.
            const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (!match) return false;
            const h = parseInt(match[1] || "0");
            const m = parseInt(match[2] || "0");
            const s = parseInt(match[3] || "0");
            const totalSec = h * 3600 + m * 60 + s;
            return totalSec <= 60;
        });
    }

    // Sort by view count desc, take top N
    return videos
        .sort((a: any, b: any) => parseInt(b.statistics?.viewCount || "0") - parseInt(a.statistics?.viewCount || "0"))
        .slice(0, maxResults)
        .map((v: any) => ({
            videoId: v.id,
            title: v.snippet.title,
            publishedAt: v.snippet.publishedAt?.split("T")[0],
            duration: v.contentDetails?.duration,
            views: parseInt(v.statistics?.viewCount || "0").toLocaleString(),
            likes: parseInt(v.statistics?.likeCount || "0").toLocaleString(),
            comments: parseInt(v.statistics?.commentCount || "0").toLocaleString(),
            url: `https://www.youtube.com/watch?v=${v.id}`,
        }));
}

export const youtubeAnalyticsTool = {
    name: "youtube_analytics",
    description: `Fetches live YouTube channel analytics and top video performance for the user's channels (@gracenoteinspriations and @gigawerx). 
    Can retrieve: channel overview stats (subscribers, total views, video count), top performing videos, or top Shorts. 
    Use this to answer questions like 'How is my YouTube channel doing?', 'What are my top Shorts this month?', or 'Compare my two channel performances.'
    Applies VidIQ best practices context to interpret the data.`,
    inputSchema: {
        type: "object",
        properties: {
            channel: {
                type: "string",
                description: "Channel handle without @ (e.g. 'gracenoteinspriations' or 'gigawerx'). Use 'both' to compare both channels."
            },
            report_type: {
                type: "string",
                enum: ["overview", "top_videos", "top_shorts", "full"],
                description: "Type of report: 'overview' = channel stats only, 'top_videos' = top 10 videos by views, 'top_shorts' = top Shorts under 60s, 'full' = everything."
            },
            max_results: {
                type: "number",
                description: "Max number of videos to return for top_videos/top_shorts. Default 10."
            }
        },
        required: ["channel", "report_type"]
    },
    execute: async (input: Record<string, unknown>) => {
        const channelInput = String(input.channel || "both");
        const reportType = String(input.report_type || "overview");
        const maxResults = Number(input.max_results || 10);

        console.log(`[Tool: youtube_analytics] Channel: ${channelInput}, Report: ${reportType}`);

        const channelsToQuery = channelInput === "both"
            ? ["gracenoteinspriations", "gigawerx"]
            : [channelInput.replace(/^@/, "")];

        const results: any[] = [];

        for (const handle of channelsToQuery) {
            try {
                const channel = await resolveChannelId(handle);
                const entry: any = { channel: channel.title, handle: `@${channel.handle}`, channelId: channel.id };

                if (reportType === "overview" || reportType === "full") {
                    const stats = await getChannelStats(channel.id);
                    entry.stats = {
                        subscribers: parseInt(stats.statistics?.subscriberCount || "0").toLocaleString(),
                        totalViews: parseInt(stats.statistics?.viewCount || "0").toLocaleString(),
                        videoCount: parseInt(stats.statistics?.videoCount || "0").toLocaleString(),
                        description: stats.snippet?.description?.substring(0, 200),
                    };
                }

                if (reportType === "top_videos" || reportType === "full") {
                    entry.topVideos = await getTopVideos(channel.id, maxResults, "all");
                }

                if (reportType === "top_shorts" || reportType === "full") {
                    entry.topShorts = await getTopVideos(channel.id, maxResults, "shorts");
                }

                results.push(entry);
            } catch (err: any) {
                results.push({ handle, error: err.message });
            }
        }

        const vidiqContext = `
VidIQ Best Practices to apply when analyzing this data:
- Titles should be 60-70 chars, front-load the keyword
- Shorts under 30s generally outperform 45-60s for retention
- Aim for 50%+ CTR on Shorts thumbnails; faceless channels benefit from bold text overlays
- Posting consistency matters more than frequency — 3-4x/week minimum for growth
- Hooks must deliver the promise in the first 2 seconds
`;

        return JSON.stringify({ channels: results, vidiqContext, retrievedAt: new Date().toISOString() }, null, 2);
    }
};
