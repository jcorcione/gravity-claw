import { routeUserIntent } from "./src/llm.js";
import { config } from "dotenv";

config();

async function run() {
    console.log("Testing router...");
    const res = await routeUserIntent("run an seo analysis on https://turboplumbingtampa.com");
    console.log("Router chose:", res);
}
run();
