export interface MusicTrack {
	readonly id: string;
	readonly encoded: string;
	readonly title: string;
	readonly url: string;
	readonly durationMs: number;
	readonly requestedBy: string;
}

export interface GuildQueue {
	readonly current: MusicTrack | null;
	readonly upcoming: readonly MusicTrack[];
}

export type PlayerState = 'idle' | 'playing' | 'paused' | 'destroyed';

export interface GuildPlayer {
	readonly guildId: string;
	readonly voiceChannelId: string;
	readonly state: PlayerState;
	readonly queue: GuildQueue;
}

export interface PlayResult {
	readonly kind: 'started' | 'queued' | 'playlist';
	readonly accepted: readonly MusicTrack[];
	readonly skippedCount: number;
	readonly playlistName?: string;
}

export interface PlayRequest {
	readonly guildId: string;
	readonly voiceChannelId: string;
	readonly textChannelId: string;
	readonly url: string;
	readonly urlKind: 'video' | 'playlist';
	readonly requestedBy: string;
}
