import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../command.js';

const command: Command = {
	data: new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
	async execute(interaction): Promise<void> {
		await interaction.reply('Pong!');
	},
};

export default command;
