import assert from 'node:assert/strict';
import test from 'node:test';
import type {
	AudioAdapter,
	AudioClientIdentity,
	AudioLoadResult,
	AudioPlayerOptions,
} from '../src/music/audio-adapter.js';
import playCommand from '../src/commands/music/play.js';
import { MusicService } from '../src/music/music-service.js';

class CommandAudioAdapter implements AudioAdapter {
	isAvailable = true;
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
		return this.loadResult;
	}

	async connect(_guildId: string): Promise<void> {}

	async play(_guildId: string, _encodedTrack: string): Promise<void> {}

	async destroyPlayer(_guildId: string): Promise<void> {}
}

interface InteractionOptions {
	readonly cachedGuild?: boolean;
	readonly url?: string;
	readonly voiceChannelId?: string | null;
	readonly hasPermissions?: boolean;
}

function interaction(options: InteractionOptions = {}) {
	const replies: string[] = [];
	const edits: string[] = [];
	let deferred = 0;
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
			inCachedGuild: () => options.cachedGuild ?? true,
			options: {
				getString: () =>
					options.url ?? 'https://www.youtube.com/watch?v=track',
			},
			member: { voice: { channel: voiceChannel } },
			guild: { members: { me: { id: 'bot-id' } } },
			guildId: 'guild-1',
			channelId: 'text-1',
			user: { id: 'user-1' },
			reply: async (response: string | { content: string }) => {
				replies.push(
					typeof response === 'string' ? response : response.content,
				);
			},
			deferReply: async () => {
				deferred += 1;
			},
			editReply: async (response: string | { content: string }) => {
				edits.push(
					typeof response === 'string' ? response : response.content,
				);
			},
		},
		replies,
		edits,
		get deferred() {
			return deferred;
		},
	};
}

test('rejects /play outside a cached guild', async () => {
	const target = interaction({ cachedGuild: false });

	await playCommand.execute(
		target.value as never,
		{ music: new MusicService(new CommandAudioAdapter()) },
	);

	assert.deepEqual(target.replies, [
		'This command can only be used in a server.',
	]);
});

test('rejects invalid URLs and requesters outside voice', async () => {
	const music = new MusicService(new CommandAudioAdapter());
	const invalid = interaction({ url: 'plain text' });
	const noVoice = interaction({ voiceChannelId: null });

	await playCommand.execute(invalid.value as never, { music });
	await playCommand.execute(noVoice.value as never, { music });

	assert.deepEqual(invalid.replies, [
		'Provide a valid YouTube video or playlist URL.',
	]);
	assert.deepEqual(noVoice.replies, [
		'Join a voice channel before using /play.',
	]);
});

test('enforces same-channel and bot permission checks', async () => {
	const music = new MusicService(new CommandAudioAdapter());
	await music.createGuildPlayer('guild-1', 'voice-1');
	const wrongChannel = interaction({ voiceChannelId: 'voice-2' });

	await playCommand.execute(wrongChannel.value as never, { music });

	const missingPermissions = interaction({ hasPermissions: false });
	const freshMusic = new MusicService(new CommandAudioAdapter());
	await playCommand.execute(missingPermissions.value as never, {
		music: freshMusic,
	});

	assert.deepEqual(wrongChannel.replies, [
		'You must be in my voice channel to use this command.',
	]);
	assert.deepEqual(missingPermissions.replies, [
		'I need permission to view, connect to, and speak in that voice channel.',
	]);
});

test('defers a valid request and edits it with the playback result', async () => {
	const target = interaction();

	await playCommand.execute(
		target.value as never,
		{ music: new MusicService(new CommandAudioAdapter()) },
	);

	assert.equal(target.deferred, 1);
	assert.deepEqual(target.replies, []);
	assert.deepEqual(target.edits, [
		'Now playing: [A \\[track\\]](https://www.youtube.com/watch?v=track)',
	]);
});
