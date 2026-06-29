import type { Command } from '../../command.js';

const command: Command = {
	name: 'ping',
	description: 'Replies with Pong!',
	usage: 'ping',
	async execute(message): Promise<void> {
		await message.reply('Pong!');
	},
};

export default command;
