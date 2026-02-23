import { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return res.status(200).json({
        ok: true,
        env: {
            supabase: !!process.env.SUPABASE_DB_URL,
            telegram: !!process.env.TELEGRAM_BOT_TOKEN,
            openrouter: !!process.env.OPENROUTER_API_KEY,
            vercel: !!process.env.VERCEL
        }
    });
}
