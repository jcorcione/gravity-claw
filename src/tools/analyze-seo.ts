import * as cheerio from "cheerio";
import fetch from "node-fetch";

export const analyzeSeoTool = {
    name: "analyze_seo",
    description: "Performs a fast, deep SEO and performance audit on any URL. Fetches on-page metadata (Title, Description, H1/H2s, word count) and uses Google PageSpeed Insights API (Lighthouse) to return Core Web Vitals, Performance scores, and SEO scores. Use this to help a user audit their website or a client's website for lead generation.",
    inputSchema: {
        type: "object",
        properties: {
            url: {
                type: "string",
                description: "The full URL to analyze, e.g., https://delcormedia.com"
            },
            strategy: {
                type: "string",
                enum: ["mobile", "desktop"],
                description: "Device strategy for Google PageSpeed Insights. Defaults to 'mobile'."
            }
        },
        required: ["url"]
    },
    execute: async (input: Record<string, unknown>) => {
        const url = String(input.url);
        const strategy = input.strategy === "desktop" ? "desktop" : "mobile";
        console.log(`[Tool: analyze_seo] Auditing URL: ${url} (Strategy: ${strategy})...`);

        let htmlData = {
            title: "N/A",
            metaDescription: "N/A",
            h1s: [] as string[],
            h2Count: 0,
            wordCount: 0,
            error: null as string | null
        };

        // 1. Fetch raw HTML for On-Page SEO
        try {
            const res = await fetch(url, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NexusAgent/1.0" }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            const html = await res.text();

            const $ = cheerio.load(html);
            htmlData.title = $("title").text().trim() || "Missing <title>";
            htmlData.metaDescription = $("meta[name='description']").attr("content") || "Missing Meta Description";

            $("h1").each((_, el) => {
                const text = $(el).text().trim();
                if (text) htmlData.h1s.push(text);
            });

            htmlData.h2Count = $("h2").length;

            // Very rough word count estimation of body text
            const bodyText = $("body").text().replace(/\s+/g, ' ').trim();
            htmlData.wordCount = bodyText.split(' ').length;

        } catch (err: any) {
            console.error(`[analyze_seo] HTML fetch failed for ${url}:`, err);
            htmlData.error = err.message;
        }

        // 2. Fetch Google PageSpeed Insights (Lighthouse API)
        let psiData = {
            performanceScore: "N/A",
            seoScore: "N/A",
            accessibilityScore: "N/A",
            bestPracticesScore: "N/A",
            loadTimeMs: "N/A",
            error: null as string | null
        };

        try {
            // Note: The public API doesn't strictly *require* a key for low volume, but will rate limit.
            // In a true SaaS we would pass a key. We'll try the unauthenticated route first.
            const psiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
            psiUrl.searchParams.set("url", url);
            psiUrl.searchParams.set("strategy", strategy);
            psiUrl.searchParams.append("category", "performance");
            psiUrl.searchParams.append("category", "seo");
            psiUrl.searchParams.append("category", "accessibility");
            psiUrl.searchParams.append("category", "best-practices");

            if (process.env.GOOGLE_PAGESPEED_API_KEY) {
                psiUrl.searchParams.set("key", process.env.GOOGLE_PAGESPEED_API_KEY);
            }

            const psiRes = await fetch(psiUrl.toString());
            if (!psiRes.ok) throw new Error(`PSI HTTP ${psiRes.status}`);

            const pData = await psiRes.json() as any;
            const lighthouse = pData.lighthouseResult;

            if (lighthouse && lighthouse.categories) {
                psiData.performanceScore = Math.round(lighthouse.categories.performance?.score * 100) + "/100" || "N/A";
                psiData.seoScore = Math.round(lighthouse.categories.seo?.score * 100) + "/100" || "N/A";
                psiData.accessibilityScore = Math.round(lighthouse.categories.accessibility?.score * 100) + "/100" || "N/A";
                psiData.bestPracticesScore = Math.round(lighthouse.categories['best-practices']?.score * 100) + "/100" || "N/A";
            }

            // Time to Interactive approx load time
            if (lighthouse && lighthouse.audits && lighthouse.audits.interactive) {
                psiData.loadTimeMs = lighthouse.audits.interactive.numericValue
                    ? `${Math.round(lighthouse.audits.interactive.numericValue)}ms`
                    : "N/A";
            }

        } catch (err: any) {
            console.error(`[analyze_seo] PageSpeed fetch failed for ${url}:`, err);
            psiData.error = err.message;
            if (err.message.includes("429")) {
                psiData.error += " (Rate limited by Google. Add GOOGLE_PAGESPEED_API_KEY to .env to fix this)";
            }
        }

        return JSON.stringify({
            targetUrl: url,
            deviceStrategy: strategy,
            onPageHtmlAnalysis: htmlData,
            googleLighthouseAnalysis: psiData,
            instructionsForLLM: "Analyze the data provided. If there are missing H1s, missing meta descriptions, or low performance/SEO scores, formulate a list of 'Low Hanging Fruit' recommendations to present to the user. Present this data in a clean, professional markdown format suitable for a client audit report."
        }, null, 2);
    }
};
