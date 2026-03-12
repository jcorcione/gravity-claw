import { runAgentLoop } from "./src/agent.js";
import { config } from "dotenv";

config();

async function run() {
    console.log("Starting agent loop...");
    const res = await runAgentLoop("run an seo analysis on https://turboplumbingtampa.com", "test_user", true);
    console.log("\nFINAL RESPONSE:\n", res);
}

run();
