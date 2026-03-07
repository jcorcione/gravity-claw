import { config } from "./config.js";
import { chat, routeUserIntent, type ChatMessage } from "./llm.js";
import { executeTool } from "./tools/index.js";
import { EscalationError } from "./errors.js";
import { getFallbackSmarterModel, setActiveModel } from "./models.js";
import { saveMessage } from "./memory-pg.js";
import { getAgentTools } from "./agents/toolkits.js";

// ─── Agent Loop ──────────────────────────────────────────

export async function runAgentLoop(userMessage: string, userId: string = "default_user", skipMemory: boolean = false): Promise<string> {
    if (!skipMemory) {
        await saveMessage("user", userMessage, userId);
    }

    const messages: ChatMessage[] = [
        { role: "user", content: userMessage },
    ];

    // Determine intent once at the start of the loop
    const targetAgent = await routeUserIntent(userMessage);
    console.log(`\n  🎯 Routed to Sub-Agent: [${targetAgent}]`);

    // Wrap in an escalation loop: if escalated, switch models and start from the top.
    while (true) {
        // Fetch specific agent tools
        const agentTools = getAgentTools(targetAgent);

        let escalationTriggered = false;

        for (let iteration = 0; iteration < config.maxAgentIterations; iteration++) {
            const response = await chat(messages, agentTools, targetAgent);
            const choice = response.choices[0];

            if (!choice) {
                return "(No response from LLM)";
            }

            const message = choice.message;

            if (!message.tool_calls || message.tool_calls.length === 0) {
                const text = message.content ?? "(No response)";
                if (!skipMemory) {
                    await saveMessage("assistant", text, userId);
                }
                return text;
            }

            // Append the assistant's response (with tool_calls) to the conversation
            if (!skipMemory) {
                await saveMessage("assistant", message.content || "(Tool Call)", userId);
            }
            messages.push({
                role: "assistant",
                content: message.content,
                tool_calls: message.tool_calls,
            });

            // Execute each tool call and append results
            for (const call of message.tool_calls) {
                if (call.type !== "function") continue;

                const toolName = call.function.name;
                console.log(`  🔧 [${targetAgent}] Tool call: ${toolName}`);

                let parsedArgs: Record<string, unknown> = {};
                try {
                    parsedArgs = JSON.parse(call.function.arguments || "{}");
                } catch {
                    console.error(`  ⚠️ Failed to parse tool args for ${toolName}`);
                }

                try {
                    const foundTool = agentTools.find(t => t.name === toolName);
                    if (!foundTool) {
                        throw new Error(`Tool ${toolName} is not available to the ${targetAgent} agent.`);
                    }

                    const isMcp = toolName.startsWith("mcp_");
                    const result = isMcp
                        ? await foundTool.execute(parsedArgs)
                        : await executeTool(toolName, parsedArgs, { userId });

                    console.log(`  ✅ Tool result: ${result.substring(0, 100)}...`);

                    if (!skipMemory) {
                        await saveMessage("tool", `[${toolName}] ${result}`, userId);
                    }
                    messages.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: result,
                    });
                } catch (err) {
                    if (err && typeof err === 'object' && 'name' in err && err.name === 'EscalationError') {
                        console.log(`\n  🚀 ESCALATION TRIGGERED: ${(err as EscalationError).reason}`);
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
            messages.splice(1);
            continue; // restart the while(true) loop
        }

        return "⚠️ I hit the maximum number of reasoning steps. Here's what I was working on — try rephrasing your request if I didn't finish.";
    }
}
