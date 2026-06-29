import type { Command } from '../../command.js';

const command: Command = {
	name: 'user',
	description: 'Provides information about the user.',
	usage: 'user',
	guildOnly: true,
	async execute(message): Promise<void> {
		if (!message.inGuild() || !message.member) {
			await message.reply('This command can only be used in a server.');
			return;
		}

		await message.reply(
			`This command was run by ${message.author.username}, who joined on ${message.member.joinedAt}.`,
		);
	},
};

export default command;
