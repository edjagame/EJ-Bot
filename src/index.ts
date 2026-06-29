import {
	Client,
	Events,
	GatewayIntentBits,
	Partials,
} from 'discord.js';
import { loadRuntimeConfig } from './config.js';
import { loadCommands } from './load-commands.js';
import { MessageCommandDeduper } from './message-command-deduper.js';
import { handleMessageCommand } from './message-command-handler.js';
import { LavalinkAudioAdapter } from './music/audio-adapter.js';
import { MusicService } from './music/music-service.js';
import { handleVoiceStateCleanup } from './music/voice-state-cleanup.js';
import type {
	CommandContext,
	CommandFeature,
} from './command.js';

const runtimeConfig = loadRuntimeConfig();
const commands = await loadCommands();
const intents = [
	GatewayIntentBits.Guilds,
	GatewayIntentBits.GuildMessages,
	GatewayIntentBits.DirectMessages,
	GatewayIntentBits.MessageContent,
];

if (runtimeConfig.music.enabled) {
	intents.push(GatewayIntentBits.GuildVoiceStates);
}

const client = new Client({
	intents,
	partials: [Partials.Channel],
});
const music =
	runtimeConfig.music.enabled && runtimeConfig.lavalink
		? new MusicService(
				new LavalinkAudioAdapter(client, runtimeConfig.lavalink),
				{
					emptyChannelGraceMs:
						runtimeConfig.music.emptyChannelGraceMs,
					notify: async ({ textChannelId, content }) => {
						const channel =
							await client.channels.fetch(textChannelId);

						if (!channel?.isSendable()) {
							console.warn(
								'Cannot send a music notification to its text channel.',
								{
									event: 'music-notification-channel',
									textChannelId,
									reason: 'channel-not-sendable',
								},
							);
							return;
						}

						await channel.send({
							content,
							allowedMentions: { parse: [] },
						});
					},
				},
			)
		: null;
const commandContext: CommandContext = {
	music,
	commands,
	enabledFeatures: new Set<CommandFeature>(
		runtimeConfig.music.enabled ? ['music'] : [],
	),
};
const messageCommandDeduper = new MessageCommandDeduper();
let isShuttingDown = false;
let shutdownPromise: Promise<void> | null = null;

function shutdown(signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
	if (shutdownPromise) {
		return shutdownPromise;
	}

	isShuttingDown = true;
	console.log('Graceful shutdown started.', {
		event: 'process-shutdown',
		signal,
	});

	shutdownPromise = (async () => {
		try {
			await music?.shutdown();
		} catch (error) {
			process.exitCode = 1;
			console.error('Graceful shutdown encountered an error.', {
				event: 'process-shutdown-error',
				signal,
				error,
			});
		} finally {
			client.destroy();
		}
	})();

	return shutdownPromise;
}

process.once('SIGINT', () => {
	void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
	void shutdown('SIGTERM');
});

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);

	if (!music) {
		return;
	}

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

if (music) {
	client.on(Events.Raw, (packet) => {
		void music.forwardRawData(packet);
	});

	client.on(Events.VoiceStateUpdate, (_oldState, newState) => {
		const botUserId = client.user?.id;

		if (botUserId) {
			handleVoiceStateCleanup(newState, botUserId, music);
		}
	});
}

client.on(Events.MessageCreate, (message) => {
	if (!messageCommandDeduper.claim(message.id)) {
		return;
	}

	void handleMessageCommand(message, commandContext, { isShuttingDown });
});

await client.login(runtimeConfig.discordToken);
