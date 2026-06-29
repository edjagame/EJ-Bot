import assert from 'node:assert/strict';
import test from 'node:test';
import type {
	AudioAdapter,
	AudioClientIdentity,
} from '../src/music/audio-adapter.js';
import {
	DuplicateTrackIdError,
	MusicService,
	type MusicTrack,
} from '../src/music/music-service.js';

class FakeAudioAdapter implements AudioAdapter {
	isAvailable = true;

	async initialize(_client: AudioClientIdentity): Promise<boolean> {
		return this.isAvailable;
	}

	async forwardVoicePacket(_data: unknown): Promise<void> {}
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
