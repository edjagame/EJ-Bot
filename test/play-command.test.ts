import assert from 'node:assert/strict';
import test from 'node:test';
import type {
	AudioAdapter,
	AudioClientIdentity,
	AudioEventHandlers,
	AudioLoadResult,
	AudioPlaybackTrack,
	AudioPlayerOptions,
} from '../src/music/audio-adapter.js';
import playCommand from '../src/commands/music/play.js';
import { MusicService } from '../src/music/music-service.js';

class CommandAudioAdapter implements AudioAdapter {
	isAvailable = true;
	loadCount = 0;
	loadResult: AudioLoadResult = {
		loadType: 'track',
		tracks: [
			{
				encoded: 'encoded-track',
				title: 'A [track]',
				url: 'https://www.youtube.com/watch?v=track',
				durationMs: 60_000,
			},
		],
	skippedCount: 0,
	};

	setEventHandlers(_handlers: AudioEventHandlers): void {}

	async initialize(_client: AudioClientIdentity): Promise<boolean> {
		return true;
	}

	async forwardVoicePacket(_data: unknown): Promise<void> {}

	async createPlayer(_options: AudioPlayerOptions): Promise<void> {}

	async load(
		_guildId: string,
		_url: string,
		_requestedBy: string,
	): Promise<AudioLoadResult> {
		this.loadCount += 1;
		return this.loadResult;
	}

	async connect(_guildId: string): Promise<void> {}

	async play(
		_guildId: string,
		_track: AudioPlaybackTrack,
	): Promise<void> {}

	async stop(_guildId: string): Promise<void> {}

	async pause(_guildId: string): Promise<void> {}

	async resume(_guildId: string): Promise<void> {}

	async destroyPlayer(_guildId: string): Promise<void> {}

	async shutdown(): Promise<void> {}
}

interface MessageOptions {
	readonly inGuild?: boolean;
	readonly url?: string;
	readonly voiceChannelId?: string | null;
	readonly hasPermissions?: boolean;
}

function message(options: MessageOptions = {}) {
	const replies: string[] = [];
	const voiceChannelId =
		options.voiceChannelId === undefined ? 'voice-1' : options.voiceChannelId;
	const voiceChannel =
		voiceChannelId === null
			? null
			: {
					id: voiceChannelId,
					permissionsFor: () => ({
						has: () => options.hasPermissions ?? true,
					}),
				};

	return {
		value: {
			inGuild: () => options.inGuild ?? true,
			member: { voice: { channel: voiceChannel } },
			guild: { members: { me: { id: 'bot-id' } } },
			guildId: 'guild-1',
			channelId: 'text-1',
			author: { id: 'user-1' },
			reply: async (response: string | { content: string }) => {
				replies.push(
					typeof response === 'string' ? response : response.content,
				);
			},
		},
		replies,
	};
}

function commandContext(music: MusicService) {
	return {
		music,
		commands: new Map(),
		enabledFeatures: new Set(['music'] as const),
	};
}

function urlArgs(options: MessageOptions): string[] {
	return [
		options.url ?? 'https://www.youtube.com/watch?v=track',
	];
}

test('rejects e!play outside a guild', async () => {
	const options = { inGuild: false };
	const target = message(options);
	const music = new MusicService(new CommandAudioAdapter());

	await playCommand.execute(
		target.value as never,
		urlArgs(options),
		commandContext(music),
	);

	assert.deepEqual(target.replies, [
		'This command can only be used in a server.',
	]);
});

test('rejects invalid URLs and requesters outside voice', async () => {
	const audio = new CommandAudioAdapter();
	const music = new MusicService(audio);
	const invalidOptions = { url: 'plain text' };
	const noVoiceOptions = { voiceChannelId: null };
	const invalid = message(invalidOptions);
	const noVoice = message(noVoiceOptions);

	await playCommand.execute(
		invalid.value as never,
		urlArgs(invalidOptions),
		commandContext(music),
	);
	await playCommand.execute(
		noVoice.value as never,
		urlArgs(noVoiceOptions),
		commandContext(music),
	);

	assert.deepEqual(invalid.replies, [
		'Provide a valid YouTube video or playlist URL.',
	]);
	assert.deepEqual(noVoice.replies, [
		'Join a voice channel before using e!play.',
	]);
	assert.equal(audio.loadCount, 0);
});

test('enforces same-channel and bot permission checks', async () => {
	const music = new MusicService(new CommandAudioAdapter());
	await music.createGuildPlayer('guild-1', 'voice-1');
	const wrongChannelOptions = { voiceChannelId: 'voice-2' };
	const wrongChannel = message(wrongChannelOptions);

	await playCommand.execute(
		wrongChannel.value as never,
		urlArgs(wrongChannelOptions),
		commandContext(music),
	);

	const missingPermissionsOptions = { hasPermissions: false };
	const missingPermissions = message(missingPermissionsOptions);
	const freshMusic = new MusicService(new CommandAudioAdapter());
	await playCommand.execute(
		missingPermissions.value as never,
		urlArgs(missingPermissionsOptions),
		commandContext(freshMusic),
	);

	assert.deepEqual(wrongChannel.replies, [
		'You must be in my voice channel to use this command.',
	]);
	assert.deepEqual(missingPermissions.replies, [
		'I need permission to view, connect to, and speak in that voice channel.',
	]);
});

test('replies to a valid request with the playback result', async () => {
	const target = message();

	await playCommand.execute(
		target.value as never,
		urlArgs({}),
		commandContext(new MusicService(new CommandAudioAdapter())),
	);

	assert.deepEqual(target.replies, [
		'Now playing: [A \\[track\\]](https://www.youtube.com/watch?v=track)',
	]);
});

test('maps unavailable videos and empty playlists to user-facing errors', async () => {
	const videoAudio = new CommandAudioAdapter();
	videoAudio.loadResult = {
		loadType: 'empty',
		tracks: [],
		skippedCount: 0,
	};
	const unavailableVideo = message();

	await playCommand.execute(
		unavailableVideo.value as never,
		urlArgs({}),
		commandContext(new MusicService(videoAudio)),
	);

	const playlistAudio = new CommandAudioAdapter();
	playlistAudio.loadResult = {
		loadType: 'empty',
		tracks: [],
		skippedCount: 0,
	};
	const emptyPlaylistOptions = {
		url: 'https://www.youtube.com/playlist?list=empty-playlist',
	};
	const emptyPlaylist = message(emptyPlaylistOptions);

	await playCommand.execute(
		emptyPlaylist.value as never,
		urlArgs(emptyPlaylistOptions),
		commandContext(new MusicService(playlistAudio)),
	);

	assert.deepEqual(unavailableVideo.replies, [
		'That video is unavailable or cannot be played.',
	]);
	assert.deepEqual(emptyPlaylist.replies, [
		'That playlist has no playable videos.',
	]);
});
