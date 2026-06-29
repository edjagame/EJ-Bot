import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../command.js';

const command: Command = {
	data: new SlashCommandBuilder().setName('user').setDescription('Provides information about the user.'),
	async execute(interaction): Promise<void> {
		if (!interaction.inCachedGuild()) {
			await interaction.reply('This command can only be used in a server.');
			return;
		}

		await interaction.reply(
			`This command was run by ${interaction.user.username}, who joined on ${interaction.member.joinedAt}.`,
		);
	},
};

export default command;
