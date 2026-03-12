import { analyzeSeoTool } from "./src/tools/analyze-seo.js";
import { config } from "dotenv";

config();

async function run() {
    console.log("Testing analyze_seo...");
    const result = await analyzeSeoTool.execute({ url: "https://turboplumbingtampa.com" });
    console.log(result);
}
run();
