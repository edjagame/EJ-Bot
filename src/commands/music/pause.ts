import type { Command } from '../../command.js';
import {
	controlErrorMessage,
	replyToMessage,
	requireControlContext,
} from '../../music/music-command-helpers.js';

const command: Command = {
	name: 'pause',
	description: 'Pauses the current track.',
	usage: 'pause',
	guildOnly: true,
	async execute(message, _args, { music }): Promise<void> {
		const context = await requireControlContext(message, music);

		if (!context) {
			return;
		}

		try {
			await music.pause(context.guildId);
			await message.reply('Playback paused.');
		} catch (error) {
			const errorMessage = controlErrorMessage(error);

			if (!errorMessage) {
				throw error;
			}

			await replyToMessage(message, errorMessage);
		}
	},
};

export default command;
