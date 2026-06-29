import {
	Client,
	Events,
	GatewayIntentBits,
	MessageFlags,
} from 'discord.js';
import { loadRuntimeConfig } from './config.js';
import { loadCommands } from './load-commands.js';
import { LavalinkAudioAdapter } from './music/audio-adapter.js';
import {
	AudioServiceUnavailableError,
	MusicService,
} from './music/music-service.js';
import type { CommandContext } from './command.js';
import type { InteractionReplyOptions } from 'discord.js';

const runtimeConfig = loadRuntimeConfig();
const commands = await loadCommands();
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildVoiceStates,
	],
});
const audio = new LavalinkAudioAdapter(client, runtimeConfig.lavalink);
const music = new MusicService(audio);
const commandContext: CommandContext = { music };

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);

	void music
		.initialize({
			id: readyClient.user.id,
			username: readyClient.user.username,
		})
		.then((connected) => {
			if (!connected) {
				console.warn(
					'The audio service is unavailable after the connection timeout.',
					{ event: 'node-initialization-timeout' },
				);
			}
		})
		.catch((error: unknown) => {
			console.error('Failed to initialize the audio service.', {
				event: 'node-initialization',
				error,
			});
		});
});

client.on(Events.Raw, (packet) => {
	void music.forwardRawData(packet);
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
		await command.execute(interaction, commandContext);
	} catch (error) {
		const audioServiceUnavailable =
			error instanceof AudioServiceUnavailableError;

		if (audioServiceUnavailable) {
			console.warn('A command was rejected because Lavalink is unavailable.', {
				event: 'command-audio-unavailable',
				command: interaction.commandName,
				guildId: interaction.guildId,
				error,
			});
		} else {
			console.error('Unexpected command failure.', {
				event: 'command-error',
				command: interaction.commandName,
				guildId: interaction.guildId,
				error,
			});
		}

		const response: InteractionReplyOptions = {
			content: audioServiceUnavailable
				? 'The audio service is unavailable. Try again later.'
				: 'Something went wrong while handling that command.',
			flags: MessageFlags.Ephemeral,
		};

		if (interaction.deferred && !interaction.replied) {
			await interaction.editReply({ content: response.content });
		} else if (interaction.replied) {
			await interaction.followUp(response);
		} else {
			await interaction.reply(response);
		}
	}
});

await client.login(runtimeConfig.discordToken);
