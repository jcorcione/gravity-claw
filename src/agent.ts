import { config } from "./config.js";
import { chat, type ChatMessage } from "./llm.js";
import { getAllTools, executeTool } from "./tools/index.js";
import { getMcpTools } from "./mcp.js";
import { EscalationError } from "./errors.js";
import { getFallbackSmarterModel, setActiveModel } from "./models.js";
import { saveMessage } from "./memory-pg.js";

// ─── Agent Loop ──────────────────────────────────────────

export async function runAgentLoop(userMessage: string, userId: string = "default_user"): Promise<string> {
    await saveMessage("user", userMessage, userId);

    const messages: ChatMessage[] = [
        { role: "user", content: userMessage },
    ];

    // Wrap in an escalation loop: if escalated, switch models and start from the top.
    while (true) {
        // Merge local tools + MCP tools
        const localTools = getAllTools();
        const mcpTools = getMcpTools();
        const allTools = [...localTools, ...mcpTools];

        let escalationTriggered = false;

        for (let iteration = 0; iteration < config.maxAgentIterations; iteration++) {
            const response = await chat(messages, allTools);
            const choice = response.choices[0];

            if (!choice) {
                return "(No response from LLM)";
            }

            const message = choice.message;

            if (!message.tool_calls || message.tool_calls.length === 0) {
                const text = message.content ?? "(No response)";
                await saveMessage("assistant", text, userId);
                return text;
            }

            // Append the assistant's response (with tool_calls) to the conversation
            await saveMessage("assistant", message.content || "(Tool Call)", userId);
            messages.push({
                role: "assistant",
                content: message.content,
                tool_calls: message.tool_calls,
            });

            // Execute each tool call and append results
            for (const call of message.tool_calls) {
                // Only handle function tool calls (skip custom tool types)
                if (call.type !== "function") continue;

                const toolName = call.function.name;
                console.log(`  🔧 Tool call: ${toolName}`);

                let parsedArgs: Record<string, unknown> = {};
                try {
                    parsedArgs = JSON.parse(call.function.arguments || "{}");
                } catch {
                    console.error(`  ⚠️ Failed to parse tool args for ${toolName}`);
                }

                try {
                    // Route: MCP tools use their own execute, local tools use the registry
                    const mcpTool = mcpTools.find((t) => t.name === toolName);
                    const result = mcpTool
                        ? await mcpTool.execute(parsedArgs)
                        : await executeTool(toolName, parsedArgs, { userId });

                    console.log(`  ✅ Tool result: ${result.substring(0, 100)}...`);

                    // Append tool result as a tool message (OpenAI format)
                    await saveMessage("tool", `[${toolName}] ${result}`, userId);
                    messages.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: result,
                    });
                } catch (err) {
                    if (err instanceof EscalationError) {
                        console.log(`\n  🚀 ESCALATION TRIGGERED: ${err.reason}`);
                        const smarter = getFallbackSmarterModel();
                        console.log(`  🧠 Switching active model to: ${smarter.alias}`);
                        setActiveModel(smarter.alias);
                        escalationTriggered = true;
                        break; // exit tool loop
                    }

                    // Normal error parsing
                    const errorMessage = err instanceof Error ? err.message : String(err);
                    messages.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: JSON.stringify({ error: errorMessage }),
                    });
                }
            }

            if (escalationTriggered) {
                break; // exit iteration loop to restart while(true)
            }
        }

        if (escalationTriggered) {
            // Remove the assistant's tool call attempts so the smarter model starts fresh
            // We want to remove everything from messages since the user message
            messages.splice(1);
            continue; // restart the while(true) loop
        }

        // Safety: hit max iterations
        return "⚠️ I hit the maximum number of reasoning steps. Here's what I was working on — try rephrasing your request if I didn't finish.";
    }
}
