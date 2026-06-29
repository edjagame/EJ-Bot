import assert from 'node:assert/strict';
import test from 'node:test';
import type { VoiceState } from 'discord.js';
import type { MusicService } from '../src/music/music-service.js';
import { handleVoiceStateCleanup } from '../src/music/voice-state-cleanup.js';

interface MusicMockCalls {
	readonly cleanups: string[];
	readonly occupancies: boolean[];
}

function musicMock(calls: MusicMockCalls): MusicService {
	return {
		getGuildPlayer: () => ({
			guildId: 'guild-1',
			voiceChannelId: 'voice-1',
			state: 'playing',
			queue: { current: null, upcoming: [] },
		}),
		cleanupGuild: async (guildId: string) => {
			calls.cleanups.push(guildId);
			return true;
		},
		updateVoiceChannelOccupancy: (
			_guildId: string,
			isOccupied: boolean,
		) => {
			calls.occupancies.push(isOccupied);
		},
	} as unknown as MusicService;
}

function voiceState(
	userId: string,
	channelId: string | null,
	memberBots: readonly boolean[],
): VoiceState {
	const members = memberBots.map((bot) => ({ user: { bot } }));

	return {
		id: userId,
		channelId,
		guild: {
			id: 'guild-1',
			channels: {
				cache: {
					get: () => ({
						isVoiceBased: () => true,
						members: {
							some: (
								predicate: (member: { user: { bot: boolean } }) => boolean,
							) => members.some(predicate),
						},
					}),
				},
			},
		},
	} as unknown as VoiceState;
}

test('cleans up when the bot is disconnected or moved unexpectedly', () => {
	const calls: MusicMockCalls = { cleanups: [], occupancies: [] };

	handleVoiceStateCleanup(
		voiceState('bot-1', null, []),
		'bot-1',
		musicMock(calls),
	);
	handleVoiceStateCleanup(
		voiceState('bot-1', 'voice-2', []),
		'bot-1',
		musicMock(calls),
	);

	assert.deepEqual(calls.cleanups, ['guild-1', 'guild-1']);
	assert.deepEqual(calls.occupancies, []);
});

test('reports whether the active voice channel has a non-bot member', () => {
	const calls: MusicMockCalls = { cleanups: [], occupancies: [] };
	const music = musicMock(calls);

	handleVoiceStateCleanup(
		voiceState('member-1', 'other-voice', [true]),
		'bot-1',
		music,
	);
	handleVoiceStateCleanup(
		voiceState('member-1', 'voice-1', [true, false]),
		'bot-1',
		music,
	);

	assert.deepEqual(calls.cleanups, []);
	assert.deepEqual(calls.occupancies, [false, true]);
});
