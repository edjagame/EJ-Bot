import assert from 'node:assert/strict';
import test from 'node:test';
import type { SearchResult } from 'lavalink-client';
import { mapLavalinkLoadResult } from '../src/music/audio-adapter.js';

test('maps playlist metadata and counts omitted or invalid entries', () => {
	const result = {
		loadType: 'playlist',
		exception: null,
		pluginInfo: { totalTracks: 4 },
		playlist: { name: 'A playlist' },
		tracks: [
			{
				encoded: 'encoded-a',
				info: {
					title: 'Track a',
					uri: 'https://www.youtube.com/watch?v=a',
					duration: 60_000,
				},
			},
			{
				encoded: undefined,
				info: {
					title: 'Unavailable',
					uri: 'https://www.youtube.com/watch?v=b',
					duration: 60_000,
				},
			},
		],
	} as unknown as SearchResult;

	assert.deepEqual(mapLavalinkLoadResult(result), {
		loadType: 'playlist',
		tracks: [
			{
				encoded: 'encoded-a',
				title: 'Track a',
				url: 'https://www.youtube.com/watch?v=a',
				durationMs: 60_000,
			},
		],
		skippedCount: 3,
		playlistName: 'A playlist',
	});
});

test('maps unexpected search results to an error result', () => {
	const result = {
		loadType: 'search',
		exception: null,
		pluginInfo: {},
		playlist: null,
		tracks: [],
	} as unknown as SearchResult;

	assert.deepEqual(mapLavalinkLoadResult(result), {
		loadType: 'error',
		tracks: [],
		skippedCount: 0,
	});
});
