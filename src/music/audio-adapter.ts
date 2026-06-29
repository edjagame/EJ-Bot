import type { Client } from 'discord.js';
import {
	LavalinkManager,
	type BotClientOptions,
	type LavalinkNode,
	type Player,
	type VoicePacket,
} from 'lavalink-client';
import type { LavalinkConfig } from '../config.js';

const CONNECTION_TIMEOUT_MS = 10_000;
const LOAD_TIMEOUT_MS = 10_000;
const RETRY_AMOUNT = 3;
const RETRY_DELAY_MS = 2_000;
const RETRY_TIMESPAN_MS = 10_000;
const NODE_ID = 'main';

export interface AudioClientIdentity {
	readonly id: string;
	readonly username?: string;
}

export interface AudioAdapter {
	readonly isAvailable: boolean;
	initialize(client: AudioClientIdentity): Promise<boolean>;
	forwardVoicePacket(data: unknown): Promise<void>;
}

function nodeContext(node: LavalinkNode): Record<string, unknown> {
	return {
		nodeId: node.options.id ?? NODE_ID,
		host: node.options.host,
		port: node.options.port,
		secure: node.options.secure ?? false,
	};
}

function playerContext(player: Player): Record<string, unknown> {
	return {
		guildId: player.guildId,
		...nodeContext(player.node),
	};
}

export class LavalinkAudioAdapter implements AudioAdapter {
	readonly #manager: LavalinkManager;
	#initialization: Promise<boolean> | null = null;

	constructor(client: Client, config: LavalinkConfig) {
		this.#manager = new LavalinkManager({
			nodes: [
				{
					id: NODE_ID,
					host: config.host,
					port: config.port,
					authorization: config.password,
					secure: config.secure,
					requestSignalTimeoutMS: LOAD_TIMEOUT_MS,
					retryAmount: RETRY_AMOUNT,
					retryDelay: RETRY_DELAY_MS,
					retryTimespan: RETRY_TIMESPAN_MS,
				},
			],
			sendToShard: (guildId, payload) => {
				const guild = client.guilds.cache.get(guildId);

				if (!guild) {
					console.warn('Cannot send a Lavalink voice payload to Discord.', {
						event: 'voice-payload',
						guildId,
						reason: 'guild-not-cached',
					});
					return;
				}

				guild.shard.send(payload);
			},
			autoSkip: false,
			autoMove: false,
			autoSkipOnResolveError: false,
		});

		this.#registerLifecycleLogging();
	}

	get isAvailable(): boolean {
		return this.#manager.useable;
	}

	initialize(client: AudioClientIdentity): Promise<boolean> {
		this.#initialization ??= this.#initialize(client);
		return this.#initialization;
	}

	async forwardVoicePacket(data: unknown): Promise<void> {
		try {
			await this.#manager.sendRawData(data as VoicePacket);
		} catch (error) {
			console.error('Failed to forward a Discord voice event to Lavalink.', {
				event: 'voice-packet',
				error,
			});
		}
	}

	async #initialize(client: AudioClientIdentity): Promise<boolean> {
		const clientData: BotClientOptions = {
			id: client.id,
			username: client.username,
		};

		await this.#manager.init(clientData);

		if (this.isAvailable) {
			return true;
		}

		return new Promise<boolean>((resolve) => {
			let settled = false;

			const finish = (connected: boolean): void => {
				if (settled) {
					return;
				}

				settled = true;
				clearTimeout(timeout);
				this.#manager.nodeManager.off('connect', onConnect);
				this.#manager.nodeManager.off('destroy', onDestroy);
				resolve(connected);
			};

			const onConnect = (): void => {
				finish(true);
			};

			const onDestroy = (): void => {
				if (!this.isAvailable) {
					finish(false);
				}
			};

			const timeout = setTimeout(() => {
				finish(this.isAvailable);
			}, CONNECTION_TIMEOUT_MS);

			this.#manager.nodeManager.on('connect', onConnect);
			this.#manager.nodeManager.on('destroy', onDestroy);
		});
	}

	#registerLifecycleLogging(): void {
		const nodes = this.#manager.nodeManager;

		nodes.on('connect', (node) => {
			console.log('Connected to Lavalink.', {
				event: 'node-connect',
				...nodeContext(node),
			});
		});

		nodes.on('disconnect', (node, reason) => {
			console.warn('Disconnected from Lavalink.', {
				event: 'node-disconnect',
				...nodeContext(node),
				reason,
			});
		});

		nodes.on('reconnectinprogress', (node) => {
			console.warn('Lavalink reconnection scheduled.', {
				event: 'node-reconnect-pending',
				...nodeContext(node),
			});
		});

		nodes.on('reconnecting', (node) => {
			console.warn('Reconnecting to Lavalink.', {
				event: 'node-reconnecting',
				...nodeContext(node),
			});
		});

		nodes.on('destroy', (node, reason) => {
			console.warn('Lavalink node was destroyed.', {
				event: 'node-destroy',
				...nodeContext(node),
				reason,
			});
		});

		nodes.on('error', (node, error, payload) => {
			console.error('Lavalink node error.', {
				event: 'node-error',
				...nodeContext(node),
				error,
				payload,
			});
		});

		this.#manager.on('playerDestroy', (player, reason) => {
			console.warn('Lavalink player was destroyed.', {
				event: 'player-destroy',
				...playerContext(player),
				reason,
			});
		});

		this.#manager.on('trackEnd', (player, _track, payload) => {
			console.log('Lavalink track ended.', {
				event: 'track-end',
				...playerContext(player),
				reason: payload.reason,
			});
		});

		this.#manager.on('trackError', (player, _track, payload) => {
			console.error('Lavalink track error.', {
				event: 'track-error',
				...playerContext(player),
				exception: payload.exception,
			});
		});

		this.#manager.on('trackStuck', (player, _track, payload) => {
			console.error('Lavalink track stuck.', {
				event: 'track-stuck',
				...playerContext(player),
				thresholdMs: payload.thresholdMs,
			});
		});
	}
}
