import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { config } from "./config.js";
import { runAgentLoop } from "./agent.js";
import { initMemory, closeDatabase, getMemoryCount, getScheduleCount } from "./memory-pg.js";
import { initPinecone } from "./pinecone.js";
import { initMcpServers, disconnectAll } from "./mcp.js";
import { getActiveModel } from "./models.js";

async function main() {
    console.log("=========================================");
    console.log("       GRAVITY CLAW - TERMINAL UI       ");
    console.log("=========================================\n");

    // Initialize systems
    console.log("System Status:");
    console.log("-------------");

    process.stdout.write("📦 Connecting to Supabase Memory...");
    await initMemory();
    console.log(` ✅ (${await getMemoryCount()} memories, ${await getScheduleCount()} schedules)`);

    process.stdout.write("🌲 Connecting to Pinecone Semantic Memory...");
    try {
        await initPinecone();
        console.log(` ✅`);
    } catch {
        // Init pinecone logs heavily internally, so we don't need a massive stack trace here if it fails
        console.log(` ⚠️ Failed`);
    }

    process.stdout.write("🔌 Connecting MCP Servers...");
    await initMcpServers();
    console.log(" ✅\n");

    const startupModel = getActiveModel();
    console.log(`🤖 Active Core: ${startupModel.alias} (${startupModel.modelId})`);
    console.log("Type your message to chat, or type 'exit' or 'quit' to terminate the session.\n");

    const rl = readline.createInterface({ input, output });

    // Chat loop
    while (true) {
        const query = await rl.question("> ");
        const text = query.trim();

        if (!text) continue;
        if (text.toLowerCase() === "exit" || text.toLowerCase() === "quit") {
            break;
        }

        try {
            console.log("\n[Jarvis is thinking...]");
            const response = await runAgentLoop(text);
            console.log(`\n🤖 Jarvis: ${response}\n`);
        } catch (error) {
            console.error(`\n❌ Error: ${error}\n`);
        }
    }

    // Graceful Shutdown
    console.log("\n👋 Shutting down...");
    rl.close();
    await disconnectAll();
    await closeDatabase();
    process.exit(0);
}

main().catch(async (err) => {
    console.error("Fatal Error:", err);
    await disconnectAll();
    await closeDatabase();
    process.exit(1);
});
