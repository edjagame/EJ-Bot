import type { Command } from '../../command.js';
import { replyToMessage } from '../../music/music-command-helpers.js';
import { trackLink } from '../../music/music-format.js';
import type {
	GuildQueue,
	MusicTrack,
} from '../../music/music-types.js';

const MAX_MESSAGE_LENGTH = 2_000;

function trackLine(track: MusicTrack, number?: number): string {
	const prefix = number === undefined ? '' : `${number}. `;
	return `${prefix}${trackLink(track)} — requested by <@${track.requestedBy}>`;
}

function moreTracksLine(count: number): string {
	return `…and ${count} more ${count === 1 ? 'track' : 'tracks'}.`;
}

export function formatQueue(queue: GuildQueue): string {
	if (!queue.current && queue.upcoming.length === 0) {
		return 'The queue is empty.';
	}

	const fixedSections: string[] = [];

	if (queue.current) {
		fixedSections.push(
			`**Now playing**\n${trackLine(queue.current)}`,
		);
	}

	if (queue.upcoming.length === 0) {
		return fixedSections.join('\n\n');
	}

	const displayed: string[] = [];

	for (const [index, track] of queue.upcoming.entries()) {
		const nextDisplayed = [
			...displayed,
			trackLine(track, index + 1),
		];
		const omitted = queue.upcoming.length - nextDisplayed.length;
		const upcomingLines = [
			'**Up next**',
			...nextDisplayed,
			...(omitted > 0 ? [moreTracksLine(omitted)] : []),
		].join('\n');
		const candidate = [...fixedSections, upcomingLines].join('\n\n');

		if (candidate.length > MAX_MESSAGE_LENGTH) {
			break;
		}

		displayed.push(nextDisplayed.at(-1)!);
	}

	const omitted = queue.upcoming.length - displayed.length;
	const upcomingLines = [
		'**Up next**',
		...displayed,
		...(omitted > 0 ? [moreTracksLine(omitted)] : []),
	].join('\n');

	return [...fixedSections, upcomingLines].join('\n\n');
}

const command: Command = {
	name: 'queue',
	description: 'Shows the current music queue.',
	usage: 'queue',
	guildOnly: true,
	async execute(message, _args, { music }): Promise<void> {
		if (!message.inGuild()) {
			await replyToMessage(
				message,
				'This command can only be used in a server.',
			);
			return;
		}

		const queue = music.getQueue(message.guildId);
		const content = queue ? formatQueue(queue) : 'The queue is empty.';

		await message.reply({
			content,
			allowedMentions: { parse: [], repliedUser: false },
		});
	},
};

export default command;
