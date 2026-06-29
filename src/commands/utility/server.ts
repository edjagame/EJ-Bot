import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../command.js';

const command: Command = {
	data: new SlashCommandBuilder().setName('server').setDescription('Provides information about the server.'),
	async execute(interaction): Promise<void> {
		if (!interaction.inCachedGuild()) {
			await interaction.reply('This command can only be used in a server.');
			return;
		}

		await interaction.reply(
			`This server is ${interaction.guild.name} and has ${interaction.guild.memberCount} members.`,
		);
	},
};

export default command;
