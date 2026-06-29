import assert from 'node:assert/strict';
import test from 'node:test';
import { parseYouTubeUrl } from '../src/music/youtube-url.js';

test('accepts canonical YouTube video and playlist URLs', () => {
	const cases = [
		['https://www.youtube.com/watch?v=video', 'video'],
		['http://m.youtube.com/watch?v=video', 'video'],
		['https://youtu.be/video', 'video'],
		['https://youtube.com/playlist?list=playlist', 'playlist'],
		[
			'https://www.youtube.com/watch?v=video&list=playlist',
			'playlist',
		],
		['https://youtu.be/video?list=playlist', 'playlist'],
	] as const;

	for (const [url, kind] of cases) {
		assert.equal(parseYouTubeUrl(url)?.kind, kind, url);
	}
});

test('rejects text, bare IDs, unsupported hosts, and incomplete URLs', () => {
	const cases = [
		'Never Gonna Give You Up',
		'dQw4w9WgXcQ',
		'https://example.com/watch?v=video',
		'https://youtube.com.evil.example/watch?v=video',
		'https://www.youtube.com/watch',
		'https://www.youtube.com/playlist?list=',
		'https://youtu.be/',
		'https://youtu.be/video/extra',
		'ftp://www.youtube.com/watch?v=video',
		'https://user@example.com/watch?v=video',
		'https://www.youtube.com:8443/watch?v=video',
	];

	for (const value of cases) {
		assert.equal(parseYouTubeUrl(value), null, value);
	}
});
