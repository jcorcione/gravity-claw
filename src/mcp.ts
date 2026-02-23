import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "./tools/index.js";

// ─── Types ───────────────────────────────────────────────

interface McpStdioConfig {
    /** Display name */
    name: string;
    /** Transport type */
    transport?: "stdio";
    /** Command to run */
    command: string;
    /** Arguments */
    args: string[];
    /** Environment variables */
    env?: Record<string, string>;
}

interface McpHttpConfig {
    /** Display name */
    name: string;
    /** Transport type */
    transport: "http";
    /** Remote MCP server URL */
    url: string;
}

type McpServerConfig = McpStdioConfig | McpHttpConfig;

interface ConnectedServer {
    config: McpServerConfig;
    client: Client;
    transport: Transport;
    tools: Tool[];
}

// ─── State ───────────────────────────────────────────────

const servers = new Map<string, ConnectedServer>();

// ─── Public API ──────────────────────────────────────────

export function getMcpServers(): Map<string, ConnectedServer> {
    return servers;
}

export function getMcpTools(): Tool[] {
    const tools: Tool[] = [];
    for (const server of servers.values()) {
        tools.push(...server.tools);
    }
    return tools;
}

export async function connectMcpServer(config: McpServerConfig): Promise<void> {
    let transport: Transport;

    if (config.transport === "http") {
        // Remote HTTP MCP server
        console.log(`  🔌 Connecting MCP server: ${config.name} (HTTP: ${config.url})`);
        transport = new StreamableHTTPClientTransport(new URL(config.url));
    } else {
        // Local stdio MCP server
        const stdioConfig = config as McpStdioConfig;
        console.log(`  🔌 Connecting MCP server: ${config.name} (${stdioConfig.command} ${stdioConfig.args.join(" ")})`);
        transport = new StdioClientTransport({
            command: stdioConfig.command,
            args: stdioConfig.args,
            env: { ...process.env, ...(stdioConfig.env ?? {}) } as Record<string, string>,
        });
    }

    const client = new Client(
        { name: "gravity-claw", version: "0.1.0" },
        { capabilities: {} }
    );

    await client.connect(transport);

    // Discover tools from the server
    const toolsResult = await client.listTools();
    const tools: Tool[] = (toolsResult.tools ?? []).map((mcpTool) => ({
        name: `mcp_${config.name}_${mcpTool.name}`,
        description: `[MCP:${config.name}] ${mcpTool.description ?? mcpTool.name}`,
        inputSchema: (mcpTool.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
        execute: async (input: Record<string, unknown>) => {
            const result = await client.callTool({
                name: mcpTool.name,
                arguments: input,
            });
            // MCP tool results can be various types
            if (Array.isArray(result.content)) {
                return result.content
                    .map((c) => {
                        if (typeof c === "object" && c !== null && "text" in c) {
                            return (c as { text: string }).text;
                        }
                        return JSON.stringify(c);
                    })
                    .join("\n");
            }
            return JSON.stringify(result.content);
        },
    }));

    servers.set(config.name, { config, client, transport, tools });
    console.log(`  ✅ MCP server "${config.name}" connected with ${tools.length} tool(s)`);

    for (const tool of tools) {
        console.log(`     🔧 ${tool.name}`);
    }
}

export async function disconnectMcpServer(name: string): Promise<boolean> {
    const server = servers.get(name);
    if (!server) return false;

    try {
        await server.client.close();
    } catch { /* ignore */ }

    servers.delete(name);
    console.log(`  🔌 MCP server "${name}" disconnected`);
    return true;
}

export async function disconnectAll(): Promise<void> {
    for (const name of servers.keys()) {
        await disconnectMcpServer(name);
    }
}

// ─── Init from Config ────────────────────────────────────

export async function initMcpServers(): Promise<void> {
    const raw = process.env["MCP_SERVERS"];
    if (!raw) return;

    try {
        const configs: McpServerConfig[] = JSON.parse(raw);
        for (const config of configs) {
            // Vercel Serverless Functions cannot span persistent Stdio child processes using npx.
            // Attempting to do so causes parser errors and LLM hallucinations ("missing mcp.js").
            // We must skip them in production to keep the chat functional.
            if (process.env.VERCEL && config.transport !== "http") {
                console.log(`  ⏩ Skipping local MCP server "${config.name}" (not supported on Vercel Serverless)`);
                continue;
            }

            try {
                await connectMcpServer(config);
            } catch (err) {
                console.error(`  ❌ Failed to connect MCP server "${config.name}":`, err);
            }
        }
    } catch {
        console.error("  ❌ Failed to parse MCP_SERVERS JSON from .env");
    }
}

export function formatMcpStatus(): string {
    if (servers.size === 0) {
        return "No MCP servers connected.\n\nConfigure via `MCP_SERVERS` in `.env`.";
    }

    const lines: string[] = [];
    for (const [, server] of servers) {
        const toolNames = server.tools.map((t) => t.name).join(", ");
        const location = server.config.transport === "http"
            ? (server.config as McpHttpConfig).url
            : `${(server.config as McpStdioConfig).command} ${(server.config as McpStdioConfig).args.join(" ")}`;
        lines.push(`*${server.config.name}* — ${server.tools.length} tool(s)\n  \`${location}\`\n  Tools: ${toolNames}`);
    }
    return lines.join("\n\n");
}
