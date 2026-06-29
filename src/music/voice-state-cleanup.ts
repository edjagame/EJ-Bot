import type { VoiceState } from 'discord.js';
import type { MusicService } from './music-service.js';

export function handleVoiceStateCleanup(
	state: VoiceState,
	botUserId: string,
	music: MusicService,
): void {
	const guildId = state.guild.id;
	const player = music.getGuildPlayer(guildId);

	if (!player) {
		return;
	}

	if (state.id === botUserId && state.channelId !== player.voiceChannelId) {
		void music.cleanupGuild(guildId, 'voice-state').catch((error: unknown) => {
			console.error('Failed to clean up after a bot voice-state change.', {
				event: 'voice-state-cleanup',
				guildId,
				expectedVoiceChannelId: player.voiceChannelId,
				actualVoiceChannelId: state.channelId,
				error,
			});
		});
		return;
	}

	const voiceChannel = state.guild.channels.cache.get(player.voiceChannelId);

	if (!voiceChannel?.isVoiceBased()) {
		return;
	}

	const hasNonBotMember = voiceChannel.members.some(
		(member) => !member.user.bot,
	);
	music.updateVoiceChannelOccupancy(guildId, hasNonBotMember);
}
