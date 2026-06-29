export type YouTubeUrlKind = 'video' | 'playlist';

export interface ParsedYouTubeUrl {
	readonly kind: YouTubeUrlKind;
	readonly url: string;
}

const YOUTUBE_HOSTS = new Set([
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
]);

function hasValue(url: URL, key: string): boolean {
	return (url.searchParams.get(key)?.trim().length ?? 0) > 0;
}

export function parseYouTubeUrl(value: string): ParsedYouTubeUrl | null {
	let url: URL;

	try {
		url = new URL(value.trim());
	} catch {
		return null;
	}

	if (
		(url.protocol !== 'https:' && url.protocol !== 'http:') ||
		url.username ||
		url.password ||
		url.port
	) {
		return null;
	}

	if (url.hostname === 'youtu.be') {
		const pathParts = url.pathname.split('/').filter(Boolean);

		if (pathParts.length !== 1) {
			return null;
		}

		return {
			kind: hasValue(url, 'list') ? 'playlist' : 'video',
			url: url.href,
		};
	}

	if (!YOUTUBE_HOSTS.has(url.hostname)) {
		return null;
	}

	const hasPlaylistId = hasValue(url, 'list');

	if (
		hasPlaylistId &&
		(url.pathname === '/playlist' || url.pathname === '/watch')
	) {
		return { kind: 'playlist', url: url.href };
	}

	if (url.pathname === '/watch' && hasValue(url, 'v')) {
		return { kind: 'video', url: url.href };
	}

	return null;
}
