import type { Command } from '../../command.js';

const command: Command = {
	name: 'server',
	description: 'Provides information about the server.',
	usage: 'server',
	guildOnly: true,
	async execute(message): Promise<void> {
		if (!message.inGuild()) {
			await message.reply('This command can only be used in a server.');
			return;
		}

		await message.reply(
			`This server is ${message.guild.name} and has ${message.guild.memberCount} members.`,
		);
	},
};

export default command;
