import "dotenv/config";
import { initMcpServers, getMcpTools } from "./src/mcp.js";

async function main() {
    await initMcpServers();
    const tools = getMcpTools();
    const wanted = ["mcp_gmail_gmail_list_messages", "mcp_gmail_gmail_get_message", "mcp_gmail_gmail_modify_message"];
    for (const t of tools) {
        if (wanted.includes(t.name)) {
            console.log(`\n--- ${t.name} ---`);
            console.log(JSON.stringify(t.inputSchema, null, 2));
        }
    }
    process.exit(0);
}

main().catch(console.error);
