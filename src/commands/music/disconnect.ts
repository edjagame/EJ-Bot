import type { Command } from '../../command.js';
import {
	controlErrorMessage,
	replyToMessage,
	requireControlContext,
} from '../../music/music-command-helpers.js';

const command: Command = {
	name: 'disconnect',
	description: 'Disconnects and clears the music queue.',
	usage: 'disconnect',
	guildOnly: true,
	async execute(message, _args, { music }): Promise<void> {
		const context = await requireControlContext(message, music);

		if (!context) {
			return;
		}

		try {
			await music.disconnect(context.guildId);
			await message.reply('Disconnected and cleared the queue.');
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
