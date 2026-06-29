import {
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../command.js';
import {
	PlaylistEmptyError,
	VideoUnavailableError,
	VoiceChannelMismatchError,
} from '../../music/music-service.js';
import type {
	MusicTrack,
	PlayResult,
} from '../../music/music-service.js';
import { parseYouTubeUrl } from '../../music/youtube-url.js';

const MAX_DISPLAY_NAME_LENGTH = 180;

function truncate(value: string): string {
	if (value.length <= MAX_DISPLAY_NAME_LENGTH) {
		return value;
	}

	return `${value.slice(0, MAX_DISPLAY_NAME_LENGTH - 1)}…`;
}

function escapeMarkdown(value: string): string {
	return truncate(value).replace(/([\\[\]()*_~`>|])/g, '\\$1');
}

function trackLink(track: MusicTrack): string {
	const safeUrl = track.url.replaceAll(')', '%29');
	return `[${escapeMarkdown(track.title)}](${safeUrl})`;
}

function formatSuccess(result: PlayResult): string {
	const first = result.accepted[0];

	if (result.kind === 'started' && first) {
		return `Now playing: ${trackLink(first)}`;
	}

	if (result.kind === 'queued' && first) {
		return `Queued: ${trackLink(first)}`;
	}

	const count = result.accepted.length;
	const trackWord = count === 1 ? 'track' : 'tracks';
	const playlist = result.playlistName
		? `**${escapeMarkdown(result.playlistName)}**`
		: 'the playlist';

	return `Added ${count} ${trackWord} from ${playlist} (${result.skippedCount} skipped).`;
}

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('play')
		.setDescription('Plays a YouTube video or playlist URL.')
		.setDMPermission(false)
		.addStringOption((option) =>
			option
				.setName('url')
				.setDescription('A YouTube video or playlist URL.')
				.setRequired(true),
		),
	async execute(interaction, { music }): Promise<void> {
		if (!interaction.inCachedGuild()) {
			await interaction.reply({
				content: 'This command can only be used in a server.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const parsedUrl = parseYouTubeUrl(
			interaction.options.getString('url', true),
		);

		if (!parsedUrl) {
			await interaction.reply({
				content: 'Provide a valid YouTube video or playlist URL.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const voiceChannel = interaction.member.voice.channel;

		if (!voiceChannel) {
			await interaction.reply({
				content: 'Join a voice channel before using /play.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const existingPlayer = music.getGuildPlayer(interaction.guildId);

		if (
			existingPlayer &&
			existingPlayer.voiceChannelId !== voiceChannel.id
		) {
			await interaction.reply({
				content: 'You must be in my voice channel to use this command.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const botMember = interaction.guild.members.me;
		const permissions = botMember
			? voiceChannel.permissionsFor(botMember)
			: null;

		if (
			!permissions?.has([
				PermissionFlagsBits.ViewChannel,
				PermissionFlagsBits.Connect,
				PermissionFlagsBits.Speak,
			])
		) {
			await interaction.reply({
				content:
					'I need permission to view, connect to, and speak in that voice channel.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		music.assertAvailable();
		await interaction.deferReply();

		try {
			const result = await music.play({
				guildId: interaction.guildId,
				voiceChannelId: voiceChannel.id,
				textChannelId: interaction.channelId,
				url: parsedUrl.url,
				urlKind: parsedUrl.kind,
				requestedBy: interaction.user.id,
			});

			await interaction.editReply(formatSuccess(result));
		} catch (error) {
			if (error instanceof VoiceChannelMismatchError) {
				await interaction.editReply(
					'You must be in my voice channel to use this command.',
				);
				return;
			}

			if (error instanceof PlaylistEmptyError) {
				await interaction.editReply(
					'That playlist has no playable videos.',
				);
				return;
			}

			if (error instanceof VideoUnavailableError) {
				await interaction.editReply(
					'That video is unavailable or cannot be played.',
				);
				return;
			}

			throw error;
		}
	},
};

export default command;
