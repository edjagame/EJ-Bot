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

test('preserves search results when Lavalink returns tracks', () => {
	const result = {
		loadType: 'search',
		exception: null,
		pluginInfo: {},
		playlist: null,
		tracks: [
			{
				encoded: 'encoded-search',
				info: {
					title: 'Search match',
					uri: 'https://www.youtube.com/watch?v=search',
					duration: 45_000,
				},
			},
		],
	} as unknown as SearchResult;

	assert.deepEqual(mapLavalinkLoadResult(result), {
		loadType: 'search',
		tracks: [
			{
				encoded: 'encoded-search',
				title: 'Search match',
				url: 'https://www.youtube.com/watch?v=search',
				durationMs: 45_000,
			},
		],
		skippedCount: 0,
	});
});

test('preserves the order of playable tracks returned by Lavalink', () => {
	const result = {
		loadType: 'playlist',
		exception: null,
		pluginInfo: { totalTracks: 3 },
		playlist: { name: 'Ordered playlist' },
		tracks: [
			{
				encoded: 'encoded-first',
				info: {
					title: 'First',
					uri: 'https://www.youtube.com/watch?v=first',
					duration: 10_000,
				},
			},
			{
				encoded: undefined,
				info: {
					title: 'Unavailable',
					uri: 'https://www.youtube.com/watch?v=missing',
					duration: 10_000,
				},
			},
			{
				encoded: 'encoded-third',
				info: {
					title: 'Third',
					uri: 'https://www.youtube.com/watch?v=third',
					duration: 30_000,
				},
			},
		],
	} as unknown as SearchResult;

	assert.deepEqual(
		mapLavalinkLoadResult(result).tracks.map((track) => track.title),
		['First', 'Third'],
	);
});
