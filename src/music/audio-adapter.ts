import type { Client } from 'discord.js';
import {
	LavalinkManager,
	type BotClientOptions,
	type LavalinkNode,
	type Player,
	type SearchResult,
	type UnresolvedSearchResult,
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

export interface AudioPlayerOptions {
	readonly guildId: string;
	readonly voiceChannelId: string;
	readonly textChannelId: string;
}

export interface AudioTrack {
	readonly encoded: string;
	readonly title: string;
	readonly url: string;
	readonly durationMs: number;
}

export interface AudioPlaybackTrack {
	readonly encoded: string;
	readonly trackId: string;
	readonly requestedBy: string;
}

export interface AudioTrackTerminalEvent {
	readonly guildId: string;
	readonly trackId: string;
	readonly kind: 'finished' | 'failed' | 'stuck';
}

export interface AudioEventHandlers {
	onTrackTerminal(event: AudioTrackTerminalEvent): void | Promise<void>;
}

export interface AudioLoadResult {
	readonly loadType: 'track' | 'playlist' | 'empty' | 'error';
	readonly tracks: readonly AudioTrack[];
	readonly skippedCount: number;
	readonly playlistName?: string;
}

export interface AudioAdapter {
	readonly isAvailable: boolean;
	setEventHandlers(handlers: AudioEventHandlers): void;
	initialize(client: AudioClientIdentity): Promise<boolean>;
	forwardVoicePacket(data: unknown): Promise<void>;
	createPlayer(options: AudioPlayerOptions): Promise<void>;
	load(
		guildId: string,
		url: string,
		requestedBy: string,
	): Promise<AudioLoadResult>;
	connect(guildId: string): Promise<void>;
	play(guildId: string, track: AudioPlaybackTrack): Promise<void>;
	stop(guildId: string): Promise<void>;
	pause(guildId: string): Promise<void>;
	resume(guildId: string): Promise<void>;
	destroyPlayer(guildId: string): Promise<void>;
}

export function mapLavalinkLoadResult(
	result: SearchResult | UnresolvedSearchResult,
): AudioLoadResult {
	const tracks = result.tracks.flatMap((track): AudioTrack[] => {
		if (
			typeof track.encoded !== 'string' ||
			track.encoded.length === 0 ||
			typeof track.info.title !== 'string' ||
			track.info.title.length === 0 ||
			typeof track.info.uri !== 'string' ||
			track.info.uri.length === 0 ||
			typeof track.info.duration !== 'number' ||
			!Number.isFinite(track.info.duration) ||
			track.info.duration < 0
		) {
			return [];
		}

		return [
			{
				encoded: track.encoded,
				title: track.info.title,
				url: track.info.uri,
				durationMs: track.info.duration,
			},
		];
	});
	const reportedTotal =
		typeof result.pluginInfo.totalTracks === 'number' &&
		Number.isFinite(result.pluginInfo.totalTracks)
			? Math.max(0, Math.trunc(result.pluginInfo.totalTracks))
			: result.tracks.length;
	const totalEntries = Math.max(reportedTotal, result.tracks.length);
	const loadType =
		result.loadType === 'track' ||
		result.loadType === 'playlist' ||
		result.loadType === 'empty'
			? result.loadType
			: 'error';

	return {
		loadType,
		tracks,
		skippedCount: Math.max(0, totalEntries - tracks.length),
		...(result.playlist?.name
			? { playlistName: result.playlist.name }
			: {}),
	};
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
	#eventHandlers: AudioEventHandlers | null = null;

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

	setEventHandlers(handlers: AudioEventHandlers): void {
		this.#eventHandlers = handlers;
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

	async createPlayer(options: AudioPlayerOptions): Promise<void> {
		if (this.#manager.getPlayer(options.guildId)) {
			throw new Error(
				`A Lavalink player already exists for guild ${options.guildId}.`,
			);
		}

		this.#manager.createPlayer({
			guildId: options.guildId,
			voiceChannelId: options.voiceChannelId,
			textChannelId: options.textChannelId,
			selfDeaf: true,
			selfMute: false,
		});
	}

	async load(
		guildId: string,
		url: string,
		requestedBy: string,
	): Promise<AudioLoadResult> {
		const player = this.#requirePlayer(guildId);
		const result = await player.search(url, requestedBy, false);

		if (result.loadType === 'error') {
			console.warn('Lavalink rejected a track load request.', {
				event: 'track-load-error',
				guildId,
				error: result.exception,
			});
		}

		return mapLavalinkLoadResult(result);
	}

	async connect(guildId: string): Promise<void> {
		await this.#requirePlayer(guildId).connect();
	}

	async play(
		guildId: string,
		track: AudioPlaybackTrack,
	): Promise<void> {
		await this.#requirePlayer(guildId).play({
			track: {
				encoded: track.encoded,
				requester: track.requestedBy,
				userData: { queueTrackId: track.trackId },
			},
			noReplace: false,
		});
	}

	async stop(guildId: string): Promise<void> {
		await this.#requirePlayer(guildId).stopPlaying(false, false);
	}

	async pause(guildId: string): Promise<void> {
		await this.#requirePlayer(guildId).pause();
	}

	async resume(guildId: string): Promise<void> {
		await this.#requirePlayer(guildId).resume();
	}

	async destroyPlayer(guildId: string): Promise<void> {
		const player = this.#manager.getPlayer(guildId);

		if (player) {
			await player.destroy('music-service-cleanup', true);
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

	#requirePlayer(guildId: string): Player {
		const player = this.#manager.getPlayer(guildId);

		if (!player) {
			throw new Error(`No Lavalink player exists for guild ${guildId}.`);
		}

		return player;
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

		this.#manager.on('trackEnd', (player, track, payload) => {
			console.log('Lavalink track ended.', {
				event: 'track-end',
				...playerContext(player),
				reason: payload.reason,
			});

			this.#handleTrackEnd(player.guildId, track, payload);
		});

		this.#manager.on('queueEnd', (player, track, payload) => {
			console.log('Lavalink queue ended.', {
				event: 'queue-end',
				...playerContext(player),
				payloadType: payload.type,
				...('reason' in payload ? { reason: payload.reason } : {}),
			});

			if (payload.type === 'TrackEndEvent') {
				this.#handleTrackEnd(player.guildId, track, payload);
			}
		});

		this.#manager.on('trackError', (player, track, payload) => {
			console.error('Lavalink track error.', {
				event: 'track-error',
				...playerContext(player),
				exception: payload.exception,
			});

			this.#emitTerminal(player.guildId, track, 'failed');
		});

		this.#manager.on('trackStuck', (player, track, payload) => {
			console.error('Lavalink track stuck.', {
				event: 'track-stuck',
				...playerContext(player),
				thresholdMs: payload.thresholdMs,
			});

			this.#emitTerminal(player.guildId, track, 'stuck');
		});
	}

	#handleTrackEnd(
		guildId: string,
		track: unknown,
		payload: { reason: string },
	): void {
		if (payload.reason === 'finished') {
			this.#emitTerminal(guildId, track, 'finished');
		} else if (payload.reason === 'loadFailed') {
			this.#emitTerminal(guildId, track, 'failed');
		}
	}

	#emitTerminal(
		guildId: string,
		track: unknown,
		kind: AudioTrackTerminalEvent['kind'],
	): void {
		const trackId = this.#trackId(track);

		if (!trackId) {
			console.warn('Ignored a Lavalink terminal event without a queue track ID.', {
				event: 'track-terminal-unidentified',
				guildId,
				kind,
			});
			return;
		}

		const event: AudioTrackTerminalEvent = { guildId, trackId, kind };

		Promise.resolve(this.#eventHandlers?.onTrackTerminal(event)).catch(
			(error: unknown) => {
				console.error('Failed to handle a Lavalink terminal event.', {
					event: 'track-terminal-handler',
					guildId,
					trackId,
					kind,
					error,
				});
			},
		);
	}

	#trackId(track: unknown): string | null {
		if (typeof track !== 'object' || track === null) {
			return null;
		}

		const userData = (track as { userData?: unknown }).userData;

		if (typeof userData !== 'object' || userData === null) {
			return null;
		}

		const trackId = (userData as { queueTrackId?: unknown }).queueTrackId;
		return typeof trackId === 'string' && trackId.length > 0
			? trackId
			: null;
	}
}
