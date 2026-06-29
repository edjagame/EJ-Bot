import {
	requireMusicService,
	type Command,
} from '../../command.js';
import {
	controlErrorMessage,
	replyToMessage,
	requireControlContext,
} from '../../music/music-command-helpers.js';

const command: Command = {
	name: 'resume',
	description: 'Resumes the paused track.',
	usage: 'resume',
	guildOnly: true,
	feature: 'music',
	async execute(message, _args, commandContext): Promise<void> {
		const music = requireMusicService(commandContext.music);
		const context = await requireControlContext(message, music);

		if (!context) {
			return;
		}

		try {
			await music.resume(context.guildId);
			await message.reply('Playback resumed.');
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
