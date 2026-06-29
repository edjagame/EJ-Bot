import { randomUUID } from 'node:crypto';
import type {
	AudioAdapter,
	AudioClientIdentity,
	AudioPlaybackTrack,
	AudioTrackTerminalEvent,
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
	textChannelId: string;
	state: PlayerState;
	queue: MutableGuildQueue;
}

export interface TrackFailureNotification {
	readonly guildId: string;
	readonly textChannelId: string;
	readonly content: string;
}

export interface MusicServiceOptions {
	readonly notify?: (
		notification: TrackFailureNotification,
	) => void | Promise<void>;
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

export class NoCurrentTrackError extends Error {
	constructor() {
		super('No track is currently playing.');
		this.name = 'NoCurrentTrackError';
	}
}

export class PlaybackAlreadyPausedError extends Error {
	constructor() {
		super('Playback is already paused.');
		this.name = 'PlaybackAlreadyPausedError';
	}
}

export class PlaybackNotPausedError extends Error {
	constructor() {
		super('Playback is not paused.');
		this.name = 'PlaybackNotPausedError';
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
	readonly #notify: NonNullable<MusicServiceOptions['notify']>;
	readonly #guilds = new Map<string, MutableGuildPlayer>();
	readonly #mutationTails = new Map<string, Promise<void>>();

	constructor(audio: AudioAdapter, options: MusicServiceOptions = {}) {
		this.#audio = audio;
		this.#notify = options.notify ?? (() => undefined);
		this.#audio.setEventHandlers({
			onTrackTerminal: (event) => this.#handleTrackTerminal(event),
		});
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
				textChannelId: '',
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
						textChannelId: request.textChannelId,
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

					await this.#audio.play(
						request.guildId,
						this.#toAudioTrack(first),
					);
					player.queue.current = first;
					player.queue.upcoming = playbackOrder.slice(1);
					player.state = 'playing';
				} else {
					player.queue.upcoming.push(...accepted);
				}

				player.textChannelId = request.textChannelId;

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

	skip(guildId: string): Promise<void> {
		return this.#mutateGuild(guildId, async () => {
			const player = this.#requireGuild(guildId);

			if (!player.queue.current) {
				throw new NoCurrentTrackError();
			}

			this.assertAvailable();
			const next = player.queue.upcoming[0] ?? null;

			try {
				if (next) {
					await this.#audio.play(guildId, this.#toAudioTrack(next));
				} else {
					await this.#audio.stop(guildId);
				}
			} catch (error) {
				throw new AudioServiceUnavailableError({ cause: error });
			}

			player.queue.current = next;
			player.state = next ? 'playing' : 'idle';

			if (next) {
				player.queue.upcoming.shift();
			}
		});
	}

	pause(guildId: string): Promise<void> {
		return this.#mutateGuild(guildId, async () => {
			const player = this.#requireGuild(guildId);

			if (!player.queue.current) {
				throw new NoCurrentTrackError();
			}

			if (player.state === 'paused') {
				throw new PlaybackAlreadyPausedError();
			}

			this.assertAvailable();

			try {
				await this.#audio.pause(guildId);
			} catch (error) {
				throw new AudioServiceUnavailableError({ cause: error });
			}

			player.state = 'paused';
		});
	}

	resume(guildId: string): Promise<void> {
		return this.#mutateGuild(guildId, async () => {
			const player = this.#requireGuild(guildId);

			if (!player.queue.current) {
				throw new NoCurrentTrackError();
			}

			if (player.state !== 'paused') {
				throw new PlaybackNotPausedError();
			}

			this.assertAvailable();

			try {
				await this.#audio.resume(guildId);
			} catch (error) {
				throw new AudioServiceUnavailableError({ cause: error });
			}

			player.state = 'playing';
		});
	}

	disconnect(guildId: string): Promise<void> {
		return this.#mutateGuild(guildId, async () => {
			this.#requireGuild(guildId);

			try {
				await this.#audio.destroyPlayer(guildId);
			} catch (error) {
				throw new AudioServiceUnavailableError({ cause: error });
			} finally {
				this.#guilds.delete(guildId);
			}
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

	async #handleTrackTerminal(
		event: AudioTrackTerminalEvent,
	): Promise<void> {
		const notification = await this.#mutateGuild(
			event.guildId,
			async (): Promise<TrackFailureNotification | null> => {
				const player = this.#guilds.get(event.guildId);

				if (!player || player.queue.current?.id !== event.trackId) {
					return null;
				}

				const failureNotification =
					event.kind === 'finished'
						? null
						: {
								guildId: event.guildId,
								textChannelId: player.textChannelId,
								content:
									'That track could not be played; trying the next queued track.',
							};

				player.queue.current = null;
				player.state = 'idle';

				if (event.kind !== 'finished') {
					try {
						await this.#audio.stop(event.guildId);
					} catch (error) {
						console.error('Failed to stop an errored music track.', {
							event: 'track-failure-stop',
							guildId: event.guildId,
							trackId: event.trackId,
							error,
						});
					}
				}

				const next = player.queue.upcoming[0];

				if (!next) {
					return failureNotification;
				}

				try {
					await this.#audio.play(
						event.guildId,
						this.#toAudioTrack(next),
					);
					player.queue.upcoming.shift();
					player.queue.current = next;
					player.state = 'playing';
				} catch (error) {
					console.error('Failed to start the next queued music track.', {
						event: 'queue-advance',
						guildId: event.guildId,
						trackId: next.id,
						error,
					});
				}

				return failureNotification;
			},
		);

		if (notification?.textChannelId) {
			try {
				await this.#notify(notification);
			} catch (error) {
				console.error('Failed to send a music track failure notification.', {
					event: 'track-failure-notification',
					guildId: notification.guildId,
					textChannelId: notification.textChannelId,
					error,
				});
			}
		}
	}

	#toAudioTrack(track: MusicTrack): AudioPlaybackTrack {
		return {
			encoded: track.encoded,
			trackId: track.id,
			requestedBy: track.requestedBy,
		};
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
