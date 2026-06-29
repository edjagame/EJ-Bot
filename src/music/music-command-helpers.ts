import type { Message } from 'discord.js';
import type { GuildPlayer } from './music-types.js';
import {
	GuildPlayerNotFoundError,
	NoCurrentTrackError,
	PlaybackAlreadyPausedError,
	PlaybackNotPausedError,
	type MusicService,
} from './music-service.js';

export interface ControlCommandContext {
	readonly guildId: string;
	readonly player: GuildPlayer;
}

export async function replyToMessage(
	message: Message,
	content: string,
): Promise<void> {
	await message.reply({
		content,
		allowedMentions: { repliedUser: false },
	});
}

export async function requireControlContext(
	message: Message,
	music: MusicService,
): Promise<ControlCommandContext | null> {
	if (!message.inGuild()) {
		await replyToMessage(
			message,
			'This command can only be used in a server.',
		);
		return null;
	}

	const player = music.getGuildPlayer(message.guildId);

	if (!player) {
		await replyToMessage(
			message,
			'Nothing is playing in this server.',
		);
		return null;
	}

	const voiceChannelId = message.member?.voice.channelId;

	if (!voiceChannelId) {
		await replyToMessage(
			message,
			'Join my voice channel to use this control.',
		);
		return null;
	}

	if (voiceChannelId !== player.voiceChannelId) {
		await replyToMessage(
			message,
			'You must be in my voice channel to use this command.',
		);
		return null;
	}

	return { guildId: message.guildId, player };
}

export function controlErrorMessage(error: unknown): string | null {
	if (error instanceof GuildPlayerNotFoundError) {
		return 'Nothing is playing in this server.';
	}

	if (error instanceof NoCurrentTrackError) {
		return 'Nothing is currently playing.';
	}

	if (error instanceof PlaybackAlreadyPausedError) {
		return 'Playback is already paused.';
	}

	if (error instanceof PlaybackNotPausedError) {
		return 'Playback is not paused.';
	}

	return null;
}
