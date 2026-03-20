import { runAgentLoop } from "./src/agent.js";
import { initMcpServers } from "./src/mcp.js";
import { initMemory, closeDatabase } from "./src/memory-pg.js";

async function main() {
    console.log("Initializing subsystems...");
    await initMemory();
    await initMcpServers();
    
    console.log("Sending prompt...");
    const response = await runAgentLoop("give me 5 script ideas for gigawerx");
    console.log("\n==================\nFINAL RESPONSE:\n==================\n", response);
    
    await closeDatabase();
    process.exit(0);
}
main();
