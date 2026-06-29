import {
	PermissionFlagsBits,
} from 'discord.js';
import {
	COMMAND_PREFIX,
	type Command,
} from '../../command.js';
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
	name: 'play',
	description: 'Plays a YouTube video or playlist URL.',
	usage: 'play <YouTube URL>',
	guildOnly: true,
	async execute(message, args, { music }): Promise<void> {
		if (!message.inGuild()) {
			await message.reply({
				content: 'This command can only be used in a server.',
				allowedMentions: { repliedUser: false },
			});
			return;
		}

		const parsedUrl =
			args.length === 1 ? parseYouTubeUrl(args[0]!) : null;

		if (!parsedUrl) {
			await message.reply({
				content: 'Provide a valid YouTube video or playlist URL.',
				allowedMentions: { repliedUser: false },
			});
			return;
		}

		const voiceChannel = message.member?.voice.channel;

		if (!voiceChannel) {
			await message.reply({
				content: `Join a voice channel before using ${COMMAND_PREFIX}play.`,
				allowedMentions: { repliedUser: false },
			});
			return;
		}

		const existingPlayer = music.getGuildPlayer(message.guildId);

		if (
			existingPlayer &&
			existingPlayer.voiceChannelId !== voiceChannel.id
		) {
			await message.reply({
				content: 'You must be in my voice channel to use this command.',
				allowedMentions: { repliedUser: false },
			});
			return;
		}

		const botMember = message.guild.members.me;
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
			await message.reply({
				content:
					'I need permission to view, connect to, and speak in that voice channel.',
				allowedMentions: { repliedUser: false },
			});
			return;
		}

		music.assertAvailable();

		try {
			const result = await music.play({
				guildId: message.guildId,
				voiceChannelId: voiceChannel.id,
				textChannelId: message.channelId,
				url: parsedUrl.url,
				urlKind: parsedUrl.kind,
				requestedBy: message.author.id,
			});

			await message.reply({
				content: formatSuccess(result),
				allowedMentions: { repliedUser: false },
			});
		} catch (error) {
			if (error instanceof VoiceChannelMismatchError) {
				await message.reply({
					content: 'You must be in my voice channel to use this command.',
					allowedMentions: { repliedUser: false },
				});
				return;
			}

			if (error instanceof PlaylistEmptyError) {
				await message.reply({
					content: 'That playlist has no playable videos.',
					allowedMentions: { repliedUser: false },
				});
				return;
			}

			if (error instanceof VideoUnavailableError) {
				await message.reply({
					content: 'That video is unavailable or cannot be played.',
					allowedMentions: { repliedUser: false },
				});
				return;
			}

			throw error;
		}
	},
};

export default command;
