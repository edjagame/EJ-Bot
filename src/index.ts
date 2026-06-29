import { env } from 'node:process';
import {
	Client,
	Events,
	GatewayIntentBits,
	MessageFlags,
} from 'discord.js';
import { config } from 'dotenv';
import { loadCommands } from './load-commands.js';
import type { InteractionReplyOptions } from 'discord.js';

config();

const token = env.DISCORD_TOKEN;

if (!token) {
	throw new Error('DISCORD_TOKEN is not set.');
}

const commands = await loadCommands();
const client = new Client({
	intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) {
		return;
	}

	const command = commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);

		const response: InteractionReplyOptions = {
			content: 'There was an error while executing this command.',
			flags: MessageFlags.Ephemeral,
		};

		if (interaction.replied || interaction.deferred) {
			await interaction.followUp(response);
		} else {
			await interaction.reply(response);
		}
	}
});

await client.login(token);
