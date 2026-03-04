import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { google } from "googleapis";
import fetch from "node-fetch";
import type { Tool } from "./index.js";

// YouTube category IDs
const CATEGORIES: Record<string, string> = {
    "faith": "29", // Nonprofits & Activism
    "inspiration": "29",
    "grace_note": "29",
    "tech": "28", // Science & Technology
    "education": "27", // Education
    "gigawerx": "28",
    "howto": "26", // Howto & Style
    "people": "22", // People & Blogs
    "entertainment": "24",
};

function getOAuth2Client() {
    const client = new google.auth.OAuth2(
        process.env["GOOGLE_CLIENT_ID"],
        process.env["GOOGLE_CLIENT_SECRET"],
    );
    client.setCredentials({
        refresh_token: process.env["GOOGLE_REFRESH_TOKEN"],
    });
    return client;
}

async function downloadToTemp(url: string): Promise<string> {
    console.log(`  ⬇️ Downloading video from URL to tmp...`);
    const tmpPath = path.join(os.tmpdir(), `yt_upload_${Date.now()}.mp4`);
    const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
    if (!res.ok) throw new Error(`Failed to download video: HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(tmpPath, Buffer.from(buffer));
    console.log(`  ✅ Downloaded to: ${tmpPath}`);
    return tmpPath;
}

export const youtubeUploadTool: Tool = {
    name: "youtube_upload",
    description: `Upload a video to John's YouTube channel using the YouTube Data API v3.

Accepts a local file path OR an R2 public URL (will download automatically).
Works for both Grace Note Inspirations (@gracenoteinspriations) and Gigawerx (@gigawerx) channels.

⚠️ Note: The upload goes to whichever YouTube channel is authorized by the GOOGLE_REFRESH_TOKEN.
If the refresh token doesn't have YouTube upload scope, it will return instructions to reauthorize.

Typical use after video_compile → r2_upload:
  youtube_upload(videoUrl="https://pub-xxx.r2.dev/video.mp4", title="...", description="...", channel="grace_note")`,
    inputSchema: {
        type: "object" as const,
        properties: {
            videoPath: {
                type: "string",
                description: "Local file path on the Railway server or desktop (e.g. /tmp/compilation.mp4)",
            },
            videoUrl: {
                type: "string",
                description: "Public URL to a video file (e.g. R2 URL). Will be downloaded to /tmp before uploading.",
            },
            title: {
                type: "string",
                description: "YouTube video title (required)",
            },
            description: {
                type: "string",
                description: "YouTube video description. Hashtags go here.",
            },
            tags: {
                type: "array",
                items: { type: "string" },
                description: "List of tags for the video",
            },
            channel: {
                type: "string",
                enum: ["grace_note", "gigawerx", "faith", "tech", "people", "education"],
                description: "Channel type — used to set the YouTube category. 'grace_note' = Nonprofits & Activism, 'gigawerx' = Science & Technology",
            },
            privacy: {
                type: "string",
                enum: ["public", "unlisted", "private"],
                description: "Privacy setting (default: unlisted — review before making public)",
            },
            madeForKids: {
                type: "boolean",
                description: "Whether video is made for kids (default: false)",
            },
        },
        required: ["title"],
    },
    execute: async (input) => {
        const missingVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]
            .filter(v => !process.env[v]);
        if (missingVars.length > 0) {
            return `Error: Missing Google OAuth env vars: ${missingVars.join(", ")}`;
        }

        const title = input.title as string;
        const description = (input.description as string | undefined) ?? "";
        const tags = (input.tags as string[] | undefined) ?? [];
        const channelType = (input.channel as string | undefined) ?? "grace_note";
        const privacy = (input.privacy as string | undefined) ?? "unlisted";
        const madeForKids = (input.madeForKids as boolean | undefined) ?? false;
        const categoryId = CATEGORIES[channelType] ?? "22";

        // Resolve video source
        let videoPath = input.videoPath as string | undefined;
        const videoUrl = input.videoUrl as string | undefined;
        let tempFile: string | null = null;

        if (!videoPath && !videoUrl) {
            return "Error: Provide either 'videoPath' (local file) or 'videoUrl' (R2 or other public URL).";
        }

        try {
            // Download from URL if needed
            if (videoUrl && !videoPath) {
                tempFile = await downloadToTemp(videoUrl);
                videoPath = tempFile;
            }

            if (!fs.existsSync(videoPath!)) {
                return `Error: Video file not found at: ${videoPath}`;
            }

            const fileSize = fs.statSync(videoPath!).size;
            const fileSizeMb = (fileSize / 1024 / 1024).toFixed(1);
            console.log(`  📹 YouTube Upload: "${title}" (${fileSizeMb} MB, ${privacy})`);

            const auth = getOAuth2Client();
            const youtube = google.youtube({ version: "v3", auth });

            const res = await youtube.videos.insert({
                part: ["snippet", "status"],
                requestBody: {
                    snippet: {
                        title,
                        description,
                        tags,
                        categoryId,
                        defaultLanguage: "en",
                        defaultAudioLanguage: "en",
                    },
                    status: {
                        privacyStatus: privacy,
                        madeForKids,
                        selfDeclaredMadeForKids: madeForKids,
                    },
                },
                media: {
                    mimeType: "video/mp4",
                    body: fs.createReadStream(videoPath!),
                },
            });

            const videoId = res.data.id;
            const videoUrl_out = `https://www.youtube.com/watch?v=${videoId}`;
            const shortsUrl = `https://www.youtube.com/shorts/${videoId}`;

            return `✅ Upload complete!

📺 **Title:** ${title}
🔒 **Privacy:** ${privacy}
🎬 **Video URL:** ${videoUrl_out}
📱 **Shorts URL:** ${shortsUrl}
🆔 **Video ID:** ${videoId}

${privacy === "unlisted" ? "⚠️ Video is UNLISTED — go to YouTube Studio to make it public when ready." : ""}`;

        } catch (err: any) {
            // Cleanup temp file
            if (tempFile) try { fs.unlinkSync(tempFile); } catch { /* ignore */ }

            // Handle auth scope error
            if (err.message?.includes("insufficient") || err.code === 403) {
                return `❌ Authorization error: The current Google refresh token doesn't have YouTube upload permission.

To fix this, you need to reauthorize with YouTube scope. Run this in your browser:
https://accounts.google.com/o/oauth2/auth?client_id=${process.env["GOOGLE_CLIENT_ID"]}&redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=https://www.googleapis.com/auth/youtube.upload%20https://www.googleapis.com/auth/youtube&response_type=code&access_type=offline&prompt=consent

Then exchange the code for a refresh token and update GOOGLE_REFRESH_TOKEN in Railway.`;
            }

            return `❌ Upload failed: ${err.message ?? err}`;
        } finally {
            if (tempFile) try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
        }
    },
};
