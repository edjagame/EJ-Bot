import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../command.js';
import {
	controlErrorMessage,
	replyEphemeral,
	requireControlContext,
} from '../../music/music-command-helpers.js';

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('disconnect')
		.setDescription('Disconnects and clears the music queue.')
		.setDMPermission(false),
	async execute(interaction, { music }): Promise<void> {
		const context = await requireControlContext(interaction, music);

		if (!context) {
			return;
		}

		try {
			await music.disconnect(context.guildId);
			await interaction.reply('Disconnected and cleared the queue.');
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
