import { randomUUID } from 'node:crypto';
import type {
	AudioAdapter,
	AudioClientIdentity,
} from './audio-adapter.js';
import type {
	GuildPlayer,
	GuildQueue,
	MusicTrack,
	PlayRequest,
	PlayResult,
	PlayerState,
} from './music-types.js';

interface MutableGuildQueue {
	current: MusicTrack | null;
	upcoming: MusicTrack[];
}

interface MutableGuildPlayer {
	guildId: string;
	voiceChannelId: string;
	state: PlayerState;
	queue: MutableGuildQueue;
}

export class AudioServiceUnavailableError extends Error {
	constructor(options?: ErrorOptions) {
		super('No Lavalink node is currently connected.', options);
		this.name = 'AudioServiceUnavailableError';
	}
}

export class GuildPlayerNotFoundError extends Error {
	constructor(guildId: string) {
		super(`No music player exists for guild ${guildId}.`);
		this.name = 'GuildPlayerNotFoundError';
	}
}

export class GuildPlayerAlreadyExistsError extends Error {
	constructor(guildId: string) {
		super(`A music player already exists for guild ${guildId}.`);
		this.name = 'GuildPlayerAlreadyExistsError';
	}
}

export class DuplicateTrackIdError extends Error {
	constructor(trackId: string) {
		super(`Track ID ${trackId} already exists in the guild queue.`);
		this.name = 'DuplicateTrackIdError';
	}
}

export class VoiceChannelMismatchError extends Error {
	constructor() {
		super('The requester is not in the player voice channel.');
		this.name = 'VoiceChannelMismatchError';
	}
}

export class VideoUnavailableError extends Error {
	constructor() {
		super('The requested video did not contain a playable track.');
		this.name = 'VideoUnavailableError';
	}
}

export class PlaylistEmptyError extends Error {
	constructor() {
		super('The requested playlist did not contain any playable tracks.');
		this.name = 'PlaylistEmptyError';
	}
}

function freezeTrack(track: MusicTrack): MusicTrack {
	return Object.freeze({ ...track });
}

function queueSnapshot(queue: MutableGuildQueue): GuildQueue {
	return Object.freeze({
		current: queue.current,
		upcoming: Object.freeze([...queue.upcoming]),
	});
}

function playerSnapshot(player: MutableGuildPlayer): GuildPlayer {
	return Object.freeze({
		guildId: player.guildId,
		voiceChannelId: player.voiceChannelId,
		state: player.state,
		queue: queueSnapshot(player.queue),
	});
}

export class MusicService {
	readonly #audio: AudioAdapter;
	readonly #guilds = new Map<string, MutableGuildPlayer>();
	readonly #mutationTails = new Map<string, Promise<void>>();

	constructor(audio: AudioAdapter) {
		this.#audio = audio;
	}

	get isAvailable(): boolean {
		return this.#audio.isAvailable;
	}

	assertAvailable(): void {
		if (!this.isAvailable) {
			throw new AudioServiceUnavailableError();
		}
	}

	initialize(client: AudioClientIdentity): Promise<boolean> {
		return this.#audio.initialize(client);
	}

	forwardRawData(data: unknown): Promise<void> {
		return this.#audio.forwardVoicePacket(data);
	}

	createGuildPlayer(
		guildId: string,
		voiceChannelId: string,
	): Promise<GuildPlayer> {
		return this.#mutateGuild(guildId, () => {
			if (this.#guilds.has(guildId)) {
				throw new GuildPlayerAlreadyExistsError(guildId);
			}

			const player: MutableGuildPlayer = {
				guildId,
				voiceChannelId,
				state: 'idle',
				queue: {
					current: null,
					upcoming: [],
				},
			};

			this.#guilds.set(guildId, player);
			return playerSnapshot(player);
		});
	}

	play(request: PlayRequest): Promise<PlayResult> {
		return this.#mutateGuild(request.guildId, async () => {
			this.assertAvailable();

			let player = this.#guilds.get(request.guildId);
			let createdPlayer = false;

			if (player && player.voiceChannelId !== request.voiceChannelId) {
				throw new VoiceChannelMismatchError();
			}

			try {
				if (!player) {
					await this.#audio.createPlayer({
						guildId: request.guildId,
						voiceChannelId: request.voiceChannelId,
						textChannelId: request.textChannelId,
					});

					player = {
						guildId: request.guildId,
						voiceChannelId: request.voiceChannelId,
						state: 'idle',
						queue: {
							current: null,
							upcoming: [],
						},
					};
					this.#guilds.set(request.guildId, player);
					createdPlayer = true;
				}

				const loaded = await this.#audio.load(
					request.guildId,
					request.url,
					request.requestedBy,
				);
				const accepted = loaded.tracks.map((track) =>
					freezeTrack({
						id: randomUUID(),
						encoded: track.encoded,
						title: track.title,
						url: track.url,
						durationMs: track.durationMs,
						requestedBy: request.requestedBy,
					}),
				);

				if (
					loaded.loadType === 'empty' ||
					loaded.loadType === 'error' ||
					accepted.length === 0
				) {
					if (request.urlKind === 'playlist') {
						throw new PlaylistEmptyError();
					}

					throw new VideoUnavailableError();
				}

				if (createdPlayer) {
					await this.#audio.connect(request.guildId);
				}

				const startsPlayback = player.queue.current === null;

				if (startsPlayback) {
					const playbackOrder = [...player.queue.upcoming, ...accepted];
					const first = playbackOrder[0];

					if (!first) {
						throw new Error('No track was available to start.');
					}

					await this.#audio.play(request.guildId, first.encoded);
					player.queue.current = first;
					player.queue.upcoming = playbackOrder.slice(1);
					player.state = 'playing';
				} else {
					player.queue.upcoming.push(...accepted);
				}

				return Object.freeze({
					kind:
						request.urlKind === 'playlist'
							? 'playlist'
							: startsPlayback
								? 'started'
								: 'queued',
					accepted: Object.freeze([...accepted]),
					skippedCount: loaded.skippedCount,
					...(loaded.playlistName
						? { playlistName: loaded.playlistName }
						: {}),
				});
			} catch (error) {
				if (createdPlayer) {
					this.#guilds.delete(request.guildId);

					try {
						await this.#audio.destroyPlayer(request.guildId);
					} catch (cleanupError) {
						console.error('Failed to roll back a new music player.', {
							event: 'play-rollback',
							guildId: request.guildId,
							error: cleanupError,
						});
					}
				}

				if (
					error instanceof PlaylistEmptyError ||
					error instanceof VideoUnavailableError ||
					error instanceof VoiceChannelMismatchError
				) {
					throw error;
				}

				throw new AudioServiceUnavailableError({ cause: error });
			}
		});
	}

	enqueue(guildId: string, tracks: readonly MusicTrack[]): Promise<GuildQueue> {
		return this.#mutateGuild(guildId, () => {
			const player = this.#requireGuild(guildId);
			const usedIds = new Set<string>();

			if (player.queue.current) {
				usedIds.add(player.queue.current.id);
			}

			for (const track of player.queue.upcoming) {
				usedIds.add(track.id);
			}

			const accepted: MusicTrack[] = [];

			for (const track of tracks) {
				if (usedIds.has(track.id)) {
					throw new DuplicateTrackIdError(track.id);
				}

				usedIds.add(track.id);
				accepted.push(freezeTrack(track));
			}

			player.queue.upcoming.push(...accepted);
			return queueSnapshot(player.queue);
		});
	}

	startNext(guildId: string): Promise<MusicTrack | null> {
		return this.#mutateGuild(guildId, () => {
			const player = this.#requireGuild(guildId);

			if (player.queue.current) {
				return player.queue.current;
			}

			return this.#startNext(player);
		});
	}

	completeCurrent(
		guildId: string,
		expectedTrackId: string,
	): Promise<MusicTrack | null> {
		return this.#mutateGuild(guildId, () => {
			const player = this.#requireGuild(guildId);

			if (player.queue.current?.id !== expectedTrackId) {
				return null;
			}

			player.queue.current = null;
			player.state = 'idle';
			return this.#startNext(player);
		});
	}

	getQueue(guildId: string): GuildQueue | null {
		const player = this.#guilds.get(guildId);
		return player ? queueSnapshot(player.queue) : null;
	}

	getGuildPlayer(guildId: string): GuildPlayer | null {
		const player = this.#guilds.get(guildId);
		return player ? playerSnapshot(player) : null;
	}

	resetGuild(guildId: string): Promise<boolean> {
		return this.#mutateGuild(guildId, () => this.#guilds.delete(guildId));
	}

	async resetAll(): Promise<void> {
		await Promise.all(this.#mutationTails.values());
		this.#guilds.clear();
	}

	#startNext(player: MutableGuildPlayer): MusicTrack | null {
		const next = player.queue.upcoming.shift() ?? null;
		player.queue.current = next;
		player.state = next ? 'playing' : 'idle';
		return next;
	}

	#requireGuild(guildId: string): MutableGuildPlayer {
		const player = this.#guilds.get(guildId);

		if (!player) {
			throw new GuildPlayerNotFoundError(guildId);
		}

		return player;
	}

	#mutateGuild<Result>(
		guildId: string,
		operation: () => Result | Promise<Result>,
	): Promise<Result> {
		const previous = this.#mutationTails.get(guildId) ?? Promise.resolve();
		const result = previous.then(operation);
		const tail = result.then(
			() => undefined,
			() => undefined,
		);

		this.#mutationTails.set(guildId, tail);

		return result.then(
			(value) => {
				this.#clearMutationTail(guildId, tail);
				return value;
			},
			(error: unknown) => {
				this.#clearMutationTail(guildId, tail);
				throw error;
			},
		);
	}

	#clearMutationTail(guildId: string, tail: Promise<void>): void {
		if (this.#mutationTails.get(guildId) === tail) {
			this.#mutationTails.delete(guildId);
		}
	}
}

export type {
	GuildPlayer,
	GuildQueue,
	MusicTrack,
	PlayerState,
	PlayResult,
	PlayRequest,
} from './music-types.js';
