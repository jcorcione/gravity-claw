import { Client, Events, Message, Partials } from "discord.js";
import { config } from "./config.js";
import { runAgentLoop } from "./agent.js";
import { canSynthesize, synthesize, isVoiceReplyEnabled } from "./voice.js";
import { resetToDefaultModel } from "./models.js";

let client: Client | null = null;

export async function startDiscordBot(): Promise<void> {
    if (!config.discordBotToken) {
        console.log(`  ⬚ Discord bot token not found - skipping Discord bot startup.`);
        return;
    }

    client = new Client({
        intents: [
            "Guilds",
            "GuildMessages",
            "MessageContent",
            "DirectMessages",
        ] as any,
        partials: [Partials.Channel, Partials.Message],
    });

    client.once(Events.ClientReady, (readyClient) => {
        console.log(`✅ Discord bot is live as ${readyClient.user.tag}`);
    });

    client.on(Events.MessageCreate, async (message: Message) => {
        // Ignore bot messages
        if (message.author.bot) return;

        // If in a server (guild), require bot to be mentioned. If direct message, ignore mentions.
        const isDirectMessage = message.guildId === null;
        const isMentioned = client?.user && message.mentions.has(client.user.id);

        if (!isDirectMessage && !isMentioned) {
            return;
        }

        const userName = message.author.username;
        const userId = message.author.id;

        // Strip the bot mention from the text
        let userMessage = message.content;
        if (client?.user && isMentioned) {
            userMessage = userMessage.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        }

        console.log(`\n💬 [Discord] ${userName}: ${userMessage}`);

        if (!message.channel.isTextBased() || message.channel.isDMBased() === false && !('sendTyping' in message.channel)) {
            // Can't send typing or text here easily but we'll try our best later via reply
        }

        try {
            if ('sendTyping' in message.channel) {
                await message.channel.sendTyping();
            }

            // Continuous typing indicator loop since runAgentLoop might take a while
            const typingInterval = setInterval(() => {
                if ('sendTyping' in message.channel) {
                    message.channel.sendTyping().catch(() => { });
                }
            }, 9000);

            const response = await runAgentLoop(userMessage, `discord_${userId}`);

            clearInterval(typingInterval);

            await sendDiscordResponse(message, response, isVoiceReplyEnabled());

        } catch (err) {
            console.error("❌ Discord Agent error:", err);
            await message.reply("Something went wrong processing your request.");
        } finally {
            resetToDefaultModel();
        }
    });

    try {
        await client.login(config.discordBotToken);
    } catch (err) {
        console.error("❌ Failed to login Discord bot:", err);
    }
}

export async function stopDiscordBot(): Promise<void> {
    if (client) {
        client.destroy();
        console.log("👋 Shut down Discord bot.");
    }
}

async function sendDiscordResponse(message: Message, text: string, withVoice: boolean): Promise<void> {
    // Discord message limit is 2000 chars. Send in chunks.
    const chunks = splitMessage(text, 2000);
    for (const chunk of chunks) {
        await message.reply({ content: chunk });
    }
    console.log(`  🤖 [Discord] Response sent (${text.length} chars)`);

    // Optionally send voice
    if (withVoice && canSynthesize()) {
        try {
            console.log(`  🔊 [Discord] Synthesizing voice...`);
            const audioBuffer = await synthesize(text);
            if ('send' in message.channel) {
                await message.channel.send({
                    files: [{
                        attachment: audioBuffer,
                        name: "voice_reply.ogg"
                    }]
                });
            } else {
                await message.reply({
                    files: [{
                        attachment: audioBuffer,
                        name: "voice_reply.ogg"
                    }]
                });
            }
            console.log(`  🔊 [Discord] Voice reply sent`);
        } catch (err) {
            console.error("  ⚠️ TTS failed (text reply was still sent):", err);
        }
    }
}

function splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        let splitIndex = remaining.lastIndexOf("\n", maxLength);
        if (splitIndex === -1 || splitIndex < maxLength / 2) {
            splitIndex = remaining.lastIndexOf(" ", maxLength);
        }
        if (splitIndex === -1 || splitIndex < maxLength / 2) {
            splitIndex = maxLength;
        }

        chunks.push(remaining.substring(0, splitIndex));
        remaining = remaining.substring(splitIndex).trimStart();
    }

    return chunks;
}
