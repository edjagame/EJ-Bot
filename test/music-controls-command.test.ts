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
import disconnectCommand from '../src/commands/music/disconnect.js';
import pauseCommand from '../src/commands/music/pause.js';
import queueCommand, {
	formatQueue,
} from '../src/commands/music/queue.js';
import resumeCommand from '../src/commands/music/resume.js';
import skipCommand from '../src/commands/music/skip.js';
import { MusicService } from '../src/music/music-service.js';
import type { GuildQueue, MusicTrack } from '../src/music/music-types.js';

class ControlAudioAdapter implements AudioAdapter {
	isAvailable = true;
	readonly played: AudioPlaybackTrack[] = [];
	stopCount = 0;
	pauseCount = 0;
	resumeCount = 0;
	destroyCount = 0;

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
		return {
			loadType: 'track',
			tracks: [
				{
					encoded: 'encoded-track',
					title: 'Track title',
					url: 'https://www.youtube.com/watch?v=track',
					durationMs: 60_000,
				},
			],
			skippedCount: 0,
		};
	}

	async connect(_guildId: string): Promise<void> {}

	async play(
		_guildId: string,
		track: AudioPlaybackTrack,
	): Promise<void> {
		this.played.push(track);
	}

	async stop(_guildId: string): Promise<void> {
		this.stopCount += 1;
	}

	async pause(_guildId: string): Promise<void> {
		this.pauseCount += 1;
	}

	async resume(_guildId: string): Promise<void> {
		this.resumeCount += 1;
	}

	async destroyPlayer(_guildId: string): Promise<void> {
		this.destroyCount += 1;
	}

	async shutdown(): Promise<void> {}
}

interface MessageOptions {
	readonly inGuild?: boolean;
	readonly voiceChannelId?: string | null;
}

function message(options: MessageOptions = {}) {
	const replies: Array<string | { content: string; allowedMentions?: unknown }> =
		[];

	return {
		value: {
			inGuild: () => options.inGuild ?? true,
			guildId: 'guild-1',
			member: {
				voice: {
					channelId:
						options.voiceChannelId === undefined
							? 'voice-1'
							: options.voiceChannelId,
				},
			},
			reply: async (
				response: string | {
					content: string;
					allowedMentions?: unknown;
				},
			) => {
				replies.push(response);
			},
		},
		replies,
		contents() {
			return replies.map((reply) =>
				typeof reply === 'string' ? reply : reply.content,
			);
		},
	};
}

function commandContext(music: MusicService) {
	return {
		music,
		commands: new Map(),
		enabledFeatures: new Set(['music'] as const),
	};
}

async function playingService(
	audio = new ControlAudioAdapter(),
): Promise<{ audio: ControlAudioAdapter; music: MusicService }> {
	const music = new MusicService(audio);
	await music.play({
		guildId: 'guild-1',
		voiceChannelId: 'voice-1',
		textChannelId: 'text-1',
		url: 'https://www.youtube.com/watch?v=track',
		urlKind: 'video',
		requestedBy: 'user-1',
	});
	return { audio, music };
}

test('control commands enforce guild, player, and same-channel requirements', async () => {
	const audio = new ControlAudioAdapter();
	const music = new MusicService(audio);
	const outsideGuild = message({ inGuild: false });
	const noPlayer = message();

	await skipCommand.execute(
		outsideGuild.value as never,
		[],
		commandContext(music),
	);
	await skipCommand.execute(
		noPlayer.value as never,
		[],
		commandContext(music),
	);

	const playing = await playingService();
	const noVoice = message({ voiceChannelId: null });
	const wrongVoice = message({ voiceChannelId: 'voice-2' });
	await skipCommand.execute(
		noVoice.value as never,
		[],
		commandContext(playing.music),
	);
	await skipCommand.execute(
		wrongVoice.value as never,
		[],
		commandContext(playing.music),
	);

	assert.deepEqual(outsideGuild.contents(), [
		'This command can only be used in a server.',
	]);
	assert.deepEqual(noPlayer.contents(), [
		'Nothing is playing in this server.',
	]);
	assert.deepEqual(noVoice.contents(), [
		'Join my voice channel to use this control.',
	]);
	assert.deepEqual(wrongVoice.contents(), [
		'You must be in my voice channel to use this command.',
	]);
});

test('pause and resume commands report success and invalid states', async () => {
	const { audio, music } = await playingService();
	const pause = message();
	const pauseAgain = message();
	const resume = message();
	const resumeAgain = message();

	await pauseCommand.execute(pause.value as never, [], commandContext(music));
	await pauseCommand.execute(
		pauseAgain.value as never,
		[],
		commandContext(music),
	);
	await resumeCommand.execute(
		resume.value as never,
		[],
		commandContext(music),
	);
	await resumeCommand.execute(
		resumeAgain.value as never,
		[],
		commandContext(music),
	);

	assert.deepEqual(pause.contents(), ['Playback paused.']);
	assert.deepEqual(pauseAgain.contents(), ['Playback is already paused.']);
	assert.deepEqual(resume.contents(), ['Playback resumed.']);
	assert.deepEqual(resumeAgain.contents(), ['Playback is not paused.']);
	assert.equal(audio.pauseCount, 1);
	assert.equal(audio.resumeCount, 1);
});

test('skip and disconnect commands mutate playback state', async () => {
	const skipped = await playingService();
	const skip = message();
	await skipCommand.execute(
		skip.value as never,
		[],
		commandContext(skipped.music),
	);

	assert.deepEqual(skip.contents(), ['Skipped the current track.']);
	assert.equal(skipped.audio.stopCount, 1);
	assert.equal(skipped.music.getQueue('guild-1')?.current, null);

	const disconnected = await playingService();
	const disconnect = message();
	await disconnectCommand.execute(
		disconnect.value as never,
		[],
		commandContext(disconnected.music),
	);

	assert.deepEqual(disconnect.contents(), [
		'Disconnected and cleared the queue.',
	]);
	assert.equal(disconnected.audio.destroyCount, 1);
	assert.equal(disconnected.music.getGuildPlayer('guild-1'), null);
});

test('e!queue is read-only and displays current and upcoming requesters', async () => {
	const { music } = await playingService();
	await music.play({
		guildId: 'guild-1',
		voiceChannelId: 'voice-1',
		textChannelId: 'text-1',
		url: 'https://www.youtube.com/watch?v=track',
		urlKind: 'video',
		requestedBy: 'user-2',
	});
	const target = message({ voiceChannelId: null });

	await queueCommand.execute(
		target.value as never,
		[],
		commandContext(music),
	);

	assert.deepEqual(target.contents(), [
		'**Now playing**\n[Track title](https://www.youtube.com/watch?v=track) — requested by <@user-1>\n\n**Up next**\n1. [Track title](https://www.youtube.com/watch?v=track) — requested by <@user-2>',
	]);
});

test('e!queue reports empty state and truncates oversized queues', async () => {
	const emptyTarget = message();
	const emptyMusic = new MusicService(new ControlAudioAdapter());
	await queueCommand.execute(
		emptyTarget.value as never,
		[],
		commandContext(emptyMusic),
	);
	assert.deepEqual(emptyTarget.contents(), ['The queue is empty.']);

	const tracks = Array.from({ length: 50 }, (_, index) =>
		testTrack(`track-${index}`),
	);
	const queue: GuildQueue = {
		current: testTrack('current'),
		upcoming: tracks,
	};
	const formatted = formatQueue(queue);

	assert(formatted.length <= 2_000);
	assert.match(formatted, /more tracks\.$/);
});

function testTrack(id: string): MusicTrack {
	return {
		id,
		encoded: `encoded-${id}`,
		title: `A long queue track ${id} ${'x'.repeat(100)}`,
		url: `https://www.youtube.com/watch?v=${id}`,
		durationMs: 60_000,
		requestedBy: `user-${id}`,
	};
}
