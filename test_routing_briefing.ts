import { routeUserIntent } from "./src/llm.js";
import { config } from "dotenv";

config();

async function run() {
    console.log("Testing router with morning briefing query...");
    const agent = await routeUserIntent("whats wrong with your connectivity for the morning breifing?");
    console.log("ROUTED TO:", agent);
}
run();
