import assert from 'node:assert/strict';
import test from 'node:test';
import type {
	AudioAdapter,
	AudioClientIdentity,
	AudioLoadResult,
	AudioPlayerOptions,
} from '../src/music/audio-adapter.js';
import {
	AudioServiceUnavailableError,
	DuplicateTrackIdError,
	MusicService,
	PlaylistEmptyError,
	VoiceChannelMismatchError,
	type MusicTrack,
} from '../src/music/music-service.js';

class FakeAudioAdapter implements AudioAdapter {
	isAvailable = true;
	loadResult: AudioLoadResult = {
		loadType: 'track',
		tracks: [
			{
				encoded: 'encoded-loaded',
				title: 'Loaded track',
				url: 'https://www.youtube.com/watch?v=loaded',
				durationMs: 60_000,
			},
		],
		skippedCount: 0,
	};
	readonly createdPlayers: AudioPlayerOptions[] = [];
	readonly connectedGuilds: string[] = [];
	readonly playedTracks: Array<{ guildId: string; encoded: string }> = [];
	readonly destroyedGuilds: string[] = [];
	connectError: Error | null = null;
	playError: Error | null = null;

	async initialize(_client: AudioClientIdentity): Promise<boolean> {
		return this.isAvailable;
	}

	async forwardVoicePacket(_data: unknown): Promise<void> {}

	async createPlayer(options: AudioPlayerOptions): Promise<void> {
		this.createdPlayers.push(options);
	}

	async load(
		_guildId: string,
		_url: string,
		_requestedBy: string,
	): Promise<AudioLoadResult> {
		return this.loadResult;
	}

	async connect(guildId: string): Promise<void> {
		if (this.connectError) {
			throw this.connectError;
		}

		this.connectedGuilds.push(guildId);
	}

	async play(guildId: string, encoded: string): Promise<void> {
		if (this.playError) {
			throw this.playError;
		}

		this.playedTracks.push({ guildId, encoded });
	}

	async destroyPlayer(guildId: string): Promise<void> {
		this.destroyedGuilds.push(guildId);
	}
}

function track(id: string): MusicTrack {
	return {
		id,
		encoded: `encoded-${id}`,
		title: `Track ${id}`,
		url: `https://www.youtube.com/watch?v=${id}`,
		durationMs: 60_000,
		requestedBy: 'requester-id',
	};
}

function createService(): MusicService {
	return new MusicService(new FakeAudioAdapter());
}

function playRequest(
	overrides: Partial<Parameters<MusicService['play']>[0]> = {},
): Parameters<MusicService['play']>[0] {
	return {
		guildId: 'guild-1',
		voiceChannelId: 'voice-1',
		textChannelId: 'text-1',
		url: 'https://www.youtube.com/watch?v=loaded',
		urlKind: 'video',
		requestedBy: 'requester-id',
		...overrides,
	};
}

test('preserves queue order across individual and batch enqueue operations', async () => {
	const music = createService();
	await music.createGuildPlayer('guild-1', 'voice-1');

	const firstEnqueue = music.enqueue('guild-1', [track('a')]);
	const secondEnqueue = music.enqueue('guild-1', [track('b'), track('c')]);
	await Promise.all([firstEnqueue, secondEnqueue]);

	assert.deepEqual(
		music.getQueue('guild-1')?.upcoming.map(({ id }) => id),
		['a', 'b', 'c'],
	);
	assert.equal((await music.startNext('guild-1'))?.id, 'a');
	assert.deepEqual(
		music.getQueue('guild-1')?.upcoming.map(({ id }) => id),
		['b', 'c'],
	);
});

test('isolates player and queue state between guilds', async () => {
	const music = createService();
	await Promise.all([
		music.createGuildPlayer('guild-1', 'voice-1'),
		music.createGuildPlayer('guild-2', 'voice-2'),
	]);
	await Promise.all([
		music.enqueue('guild-1', [track('a')]),
		music.enqueue('guild-2', [track('b')]),
	]);

	await music.startNext('guild-1');

	assert.equal(music.getQueue('guild-1')?.current?.id, 'a');
	assert.equal(music.getQueue('guild-2')?.current, null);
	assert.deepEqual(
		music.getQueue('guild-2')?.upcoming.map(({ id }) => id),
		['b'],
	);
});

test('serializes concurrent mutations submitted for the same guild', async () => {
	const music = createService();
	const creation = music.createGuildPlayer('guild-1', 'voice-1');
	const firstEnqueue = music.enqueue('guild-1', [track('a')]);
	const secondEnqueue = music.enqueue('guild-1', [track('b')]);

	await Promise.all([creation, firstEnqueue, secondEnqueue]);

	assert.deepEqual(
		music.getQueue('guild-1')?.upcoming.map(({ id }) => id),
		['a', 'b'],
	);
});

test('does not let a duplicate terminal event skip the next track', async () => {
	const music = createService();
	await music.createGuildPlayer('guild-1', 'voice-1');
	await music.enqueue('guild-1', [track('a'), track('b'), track('c')]);
	await music.startNext('guild-1');

	assert.equal((await music.completeCurrent('guild-1', 'a'))?.id, 'b');
	assert.equal(await music.completeCurrent('guild-1', 'a'), null);
	assert.equal(music.getQueue('guild-1')?.current?.id, 'b');
	assert.deepEqual(
		music.getQueue('guild-1')?.upcoming.map(({ id }) => id),
		['c'],
	);
});

test('rejects duplicate track instance IDs without partially changing the queue', async () => {
	const music = createService();
	await music.createGuildPlayer('guild-1', 'voice-1');
	await music.enqueue('guild-1', [track('a')]);

	await assert.rejects(
		music.enqueue('guild-1', [track('b'), track('a')]),
		DuplicateTrackIdError,
	);
	assert.deepEqual(
		music.getQueue('guild-1')?.upcoming.map(({ id }) => id),
		['a'],
	);
});

test('returns snapshots that cannot mutate service state', async () => {
	const music = createService();
	await music.createGuildPlayer('guild-1', 'voice-1');
	await music.enqueue('guild-1', [track('a')]);

	const snapshot = music.getQueue('guild-1');
	assert(snapshot);
	assert.throws(() => {
		(snapshot.upcoming as MusicTrack[]).push(track('b'));
	});
	assert.deepEqual(
		music.getQueue('guild-1')?.upcoming.map(({ id }) => id),
		['a'],
	);
});

test('clears guild state and does not restore it in a new service', async () => {
	const music = createService();
	await Promise.all([
		music.createGuildPlayer('guild-1', 'voice-1'),
		music.createGuildPlayer('guild-2', 'voice-2'),
	]);
	await music.enqueue('guild-1', [track('a')]);

	assert.equal(await music.resetGuild('guild-1'), true);
	assert.equal(music.getGuildPlayer('guild-1'), null);
	assert.notEqual(music.getGuildPlayer('guild-2'), null);

	await music.resetAll();
	assert.equal(music.getGuildPlayer('guild-2'), null);
	assert.equal(createService().getGuildPlayer('guild-1'), null);
});

test('starts the first video and queues repeated requests as distinct instances', async () => {
	const audio = new FakeAudioAdapter();
	const music = new MusicService(audio);

	const started = await music.play(playRequest());
	const queued = await music.play(playRequest());

	assert.equal(started.kind, 'started');
	assert.equal(queued.kind, 'queued');
	assert.notEqual(started.accepted[0]?.id, queued.accepted[0]?.id);
	assert.equal(music.getQueue('guild-1')?.current?.title, 'Loaded track');
	assert.deepEqual(
		music.getQueue('guild-1')?.upcoming.map(({ title }) => title),
		['Loaded track'],
	);
	assert.equal(audio.createdPlayers.length, 1);
	assert.deepEqual(audio.connectedGuilds, ['guild-1']);
	assert.deepEqual(audio.playedTracks, [
		{ guildId: 'guild-1', encoded: 'encoded-loaded' },
	]);
});

test('starts and queues playlist tracks in source order', async () => {
	const audio = new FakeAudioAdapter();
	audio.loadResult = {
		loadType: 'playlist',
		tracks: ['a', 'b', 'c'].map((id) => ({
			encoded: `encoded-${id}`,
			title: `Track ${id}`,
			url: `https://www.youtube.com/watch?v=${id}`,
			durationMs: 60_000,
		})),
		skippedCount: 2,
		playlistName: 'Playlist name',
	};
	const music = new MusicService(audio);

	const result = await music.play(
		playRequest({
			url: 'https://www.youtube.com/playlist?list=playlist',
			urlKind: 'playlist',
		}),
	);

	assert.equal(result.kind, 'playlist');
	assert.equal(result.playlistName, 'Playlist name');
	assert.equal(result.skippedCount, 2);
	assert.deepEqual(
		result.accepted.map(({ title }) => title),
		['Track a', 'Track b', 'Track c'],
	);
	assert.equal(music.getQueue('guild-1')?.current?.title, 'Track a');
	assert.deepEqual(
		music.getQueue('guild-1')?.upcoming.map(({ title }) => title),
		['Track b', 'Track c'],
	);
});

test('rolls back a newly created player when a playlist is empty', async () => {
	const audio = new FakeAudioAdapter();
	audio.loadResult = {
		loadType: 'empty',
		tracks: [],
		skippedCount: 0,
	};
	const music = new MusicService(audio);

	await assert.rejects(
		music.play(
			playRequest({
				url: 'https://www.youtube.com/playlist?list=empty',
				urlKind: 'playlist',
			}),
		),
		PlaylistEmptyError,
	);
	assert.equal(music.getGuildPlayer('guild-1'), null);
	assert.deepEqual(audio.destroyedGuilds, ['guild-1']);
	assert.deepEqual(audio.connectedGuilds, []);
});

test('serializes first plays and rejects a concurrent request from another channel', async () => {
	const audio = new FakeAudioAdapter();
	const music = new MusicService(audio);

	const first = music.play(playRequest());
	const second = music.play(
		playRequest({
			voiceChannelId: 'voice-2',
			url: 'https://www.youtube.com/watch?v=other',
		}),
	);

	await first;
	await assert.rejects(second, VoiceChannelMismatchError);
	assert.equal(audio.createdPlayers.length, 1);
	assert.equal(music.getGuildPlayer('guild-1')?.voiceChannelId, 'voice-1');
});

test('leaves an existing queue unchanged when an additional load is empty', async () => {
	const audio = new FakeAudioAdapter();
	const music = new MusicService(audio);
	await music.play(playRequest());
	const before = music.getQueue('guild-1');

	audio.loadResult = {
		loadType: 'empty',
		tracks: [],
		skippedCount: 0,
	};

	await assert.rejects(music.play(playRequest()));
	assert.deepEqual(music.getQueue('guild-1'), before);
	assert.deepEqual(audio.destroyedGuilds, []);
});

test('rolls back a new player when connection or initial playback fails', async () => {
	for (const failure of ['connect', 'play'] as const) {
		const audio = new FakeAudioAdapter();
		const underlying = new Error(`${failure} failed`);

		if (failure === 'connect') {
			audio.connectError = underlying;
		} else {
			audio.playError = underlying;
		}

		const music = new MusicService(audio);

		await assert.rejects(
			music.play(playRequest()),
			(error: unknown) =>
				error instanceof AudioServiceUnavailableError &&
				error.cause === underlying,
		);
		assert.equal(music.getGuildPlayer('guild-1'), null);
		assert.deepEqual(audio.destroyedGuilds, ['guild-1']);
	}
});
