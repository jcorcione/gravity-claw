import { getAgentTools } from "./src/agents/toolkits.js";
import { config } from "dotenv";

config();

async function run() {
    const tools = getAgentTools("SEO_BLOG");
    console.log("SEO_BLOG TOOLS:", tools.map(t => t.name));
}

run();
