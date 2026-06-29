import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../command.js';
import {
	controlErrorMessage,
	replyEphemeral,
	requireControlContext,
} from '../../music/music-command-helpers.js';

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('resume')
		.setDescription('Resumes the paused track.')
		.setDMPermission(false),
	async execute(interaction, { music }): Promise<void> {
		const context = await requireControlContext(interaction, music);

		if (!context) {
			return;
		}

		try {
			await music.resume(context.guildId);
			await interaction.reply('Playback resumed.');
		} catch (error) {
			const message = controlErrorMessage(error);

			if (!message) {
				throw error;
			}

			await replyEphemeral(interaction, message);
		}
	},
};

export default command;
