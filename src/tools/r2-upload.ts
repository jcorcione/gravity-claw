import * as fs from "fs";
import * as path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { Tool } from "./index.js";

function getR2Client(): S3Client {
    return new S3Client({
        region: "auto",
        endpoint: `https://${process.env["R2_ACCOUNT_ID"]}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env["R2_ACCESS_KEY_ID"] ?? "",
            secretAccessKey: process.env["R2_SECRET_ACCESS_KEY"] ?? "",
        },
    });
}

function getPublicUrl(key: string): string {
    const base = process.env["R2_PUBLIC_URL"] ?? `https://pub-b96f3866adb34da5b4275c6109e452e0.r2.dev`;
    return `${base.replace(/\/$/, "")}/${key}`;
}

const BUCKET = () => process.env["R2_BUCKET_NAME"] ?? "gni-media";

export const r2UploadTool: Tool = {
    name: "r2_upload",
    description: `Upload, list, or delete files in John's Cloudflare R2 storage bucket (gni-media).
R2 acts as the bridge between the desktop video compiler and Railway — uploaded files get a public URL Jarvis can use for YouTube uploads.

Actions:
- upload: Upload a local file from the desktop (via file path) or raw content. Returns public URL.
- list: List files in the bucket (optional prefix filter).
- delete: Remove a file from the bucket by key.

After video_compile produces a file, use r2_upload to store it and get a shareable URL.
Public base URL: https://pub-b96f3866adb34da5b4275c6109e452e0.r2.dev`,
    inputSchema: {
        type: "object" as const,
        properties: {
            action: {
                type: "string",
                enum: ["upload", "list", "delete"],
                description: "Action to perform",
            },
            filePath: {
                type: "string",
                description: "For upload: absolute local path to the file on the desktop (e.g. C:/Users/jcorc/comfyui-output/compilation.mp4)",
            },
            key: {
                type: "string",
                description: "For upload/delete: the destination filename/key in R2 (e.g. 'grace-note/prayer-001.mp4'). Auto-generated from filePath if not provided.",
            },
            prefix: {
                type: "string",
                description: "For list: optional folder prefix to filter files (e.g. 'grace-note/')",
            },
            contentType: {
                type: "string",
                description: "For upload: MIME type (default: auto-detected from extension)",
            },
        },
        required: ["action"],
    },
    execute: async (input) => {
        const missingVars = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
            .filter(v => !process.env[v]);
        if (missingVars.length > 0) {
            return `Error: Missing R2 environment variables: ${missingVars.join(", ")}. Add them to Railway.`;
        }

        const action = input.action as string;
        const client = getR2Client();
        const bucket = BUCKET();

        // ─── UPLOAD ──────────────────────────────────────────────
        if (action === "upload") {
            const filePath = input.filePath as string | undefined;
            if (!filePath) return "Error: 'filePath' is required for upload action.";

            if (!fs.existsSync(filePath)) {
                return `Error: File not found at path: ${filePath}`;
            }

            // Auto-generate key from filename if not provided
            const fileName = path.basename(filePath);
            const key = (input.key as string | undefined) ?? `uploads/${fileName}`;

            // Auto-detect content type
            const ext = path.extname(fileName).toLowerCase();
            const contentTypeMap: Record<string, string> = {
                ".mp4": "video/mp4",
                ".mp3": "audio/mpeg",
                ".wav": "audio/wav",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".webp": "image/webp",
                ".json": "application/json",
            };
            const contentType = (input.contentType as string | undefined)
                ?? contentTypeMap[ext]
                ?? "application/octet-stream";

            const fileStream = fs.createReadStream(filePath);
            const fileSize = fs.statSync(filePath).size;
            const fileSizeMb = (fileSize / 1024 / 1024).toFixed(2);

            console.log(`  ☁️ R2 Upload: ${key} (${fileSizeMb} MB) → ${bucket}`);

            try {
                // Use multipart upload for large files
                const upload = new Upload({
                    client,
                    params: {
                        Bucket: bucket,
                        Key: key,
                        Body: fileStream,
                        ContentType: contentType,
                    },
                });

                await upload.done();

                const publicUrl = getPublicUrl(key);
                return `✅ Uploaded to R2!\n📁 Key: ${key}\n🌐 Public URL: ${publicUrl}\n📦 Size: ${fileSizeMb} MB\n\nUse this URL for YouTube upload or sharing.`;
            } catch (err: any) {
                return `Error uploading to R2: ${err.message}`;
            }
        }

        // ─── LIST ────────────────────────────────────────────────
        if (action === "list") {
            const prefix = (input.prefix as string | undefined) ?? "";
            try {
                const res = await client.send(new ListObjectsV2Command({
                    Bucket: bucket,
                    Prefix: prefix,
                    MaxKeys: 50,
                }));

                const objects = res.Contents ?? [];
                if (objects.length === 0) {
                    return `No files found in R2 bucket '${bucket}'${prefix ? ` with prefix '${prefix}'` : ""}.`;
                }

                const lines = objects.map(obj => {
                    const sizeMb = ((obj.Size ?? 0) / 1024 / 1024).toFixed(2);
                    const url = getPublicUrl(obj.Key ?? "");
                    return `• ${obj.Key} (${sizeMb} MB)\n  🌐 ${url}`;
                });

                return `📦 R2 Bucket: ${bucket}\n${prefix ? `🔍 Prefix: ${prefix}\n` : ""}Found ${objects.length} file(s):\n\n${lines.join("\n\n")}`;
            } catch (err: any) {
                return `Error listing R2 bucket: ${err.message}`;
            }
        }

        // ─── DELETE ──────────────────────────────────────────────
        if (action === "delete") {
            const key = input.key as string | undefined;
            if (!key) return "Error: 'key' is required for delete action.";
            try {
                await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
                return `🗑️ Deleted from R2: ${key}`;
            } catch (err: any) {
                return `Error deleting from R2: ${err.message}`;
            }
        }

        return `Unknown action: ${action}`;
    },
};
