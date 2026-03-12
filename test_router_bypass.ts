import { runAgentLoop, routeUserIntent } from "./src/llm.js";
import { config } from "dotenv";

config();

async function run() {
    console.log("Testing router bypass...");
    console.time("Router execution time");
    
    // Test the bypass
    const route = await routeUserIntent("/video generate a short");
    
    console.timeEnd("Router execution time");
    console.log("Expected: VIDEO_CONTENT | Actual:", route);
}

run();
