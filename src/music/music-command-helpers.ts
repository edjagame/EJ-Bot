import {
	MessageFlags,
	type ChatInputCommandInteraction,
} from 'discord.js';
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

export async function replyEphemeral(
	interaction: ChatInputCommandInteraction,
	content: string,
): Promise<void> {
	await interaction.reply({
		content,
		flags: MessageFlags.Ephemeral,
	});
}

export async function requireControlContext(
	interaction: ChatInputCommandInteraction,
	music: MusicService,
): Promise<ControlCommandContext | null> {
	if (!interaction.inCachedGuild()) {
		await replyEphemeral(
			interaction,
			'This command can only be used in a server.',
		);
		return null;
	}

	const player = music.getGuildPlayer(interaction.guildId);

	if (!player) {
		await replyEphemeral(
			interaction,
			'Nothing is playing in this server.',
		);
		return null;
	}

	const voiceChannelId = interaction.member.voice.channelId;

	if (!voiceChannelId) {
		await replyEphemeral(
			interaction,
			'Join my voice channel to use this control.',
		);
		return null;
	}

	if (voiceChannelId !== player.voiceChannelId) {
		await replyEphemeral(
			interaction,
			'You must be in my voice channel to use this command.',
		);
		return null;
	}

	return { guildId: interaction.guildId, player };
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
