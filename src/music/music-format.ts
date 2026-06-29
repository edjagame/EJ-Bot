import type { MusicTrack } from './music-types.js';

const MAX_DISPLAY_NAME_LENGTH = 180;

function truncate(value: string): string {
	if (value.length <= MAX_DISPLAY_NAME_LENGTH) {
		return value;
	}

	return `${value.slice(0, MAX_DISPLAY_NAME_LENGTH - 1)}…`;
}

export function escapeMarkdown(value: string): string {
	return truncate(value).replace(/([\\[\]()*_~`>|])/g, '\\$1');
}

export function trackLink(track: MusicTrack): string {
	const safeUrl = track.url.replaceAll(')', '%29');
	return `[${escapeMarkdown(track.title)}](${safeUrl})`;
}
