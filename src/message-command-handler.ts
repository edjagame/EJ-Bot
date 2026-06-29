import type { Message } from 'discord.js';
import {
	COMMAND_PREFIX,
	isCommandEnabled,
	type CommandContext,
} from './command.js';
import { AudioServiceUnavailableError } from './music/music-service.js';

export interface MessageCommandHandlerOptions {
	isShuttingDown?: boolean;
}

async function reply(message: Message, content: string): Promise<void> {
	await message.reply({
		content,
		allowedMentions: { repliedUser: false },
	});
}

export async function handleMessageCommand(
	message: Message,
	context: CommandContext,
	options: MessageCommandHandlerOptions = {},
): Promise<void> {
	if (message.author.bot || !message.content.startsWith(COMMAND_PREFIX)) {
		return;
	}

	const commandText = message.content.slice(COMMAND_PREFIX.length).trim();
	const [rawName = 'help', ...args] = commandText
		? commandText.split(/\s+/u)
		: [];
	const commandName = rawName.toLowerCase();
	const command = context.commands.get(commandName);

	if (!command) {
		await reply(
			message,
			`Unknown command \`${commandName}\`. Use \`${COMMAND_PREFIX}help\` to see available commands.`,
		);
		return;
	}

	if (!isCommandEnabled(command, context)) {
		await reply(message, 'Music commands are temporarily disabled.');
		return;
	}

	if (options.isShuttingDown) {
		await reply(
			message,
			'The bot is shutting down. Try again after it restarts.',
		);
		return;
	}

	try {
		await command.execute(message, args, context);
	} catch (error) {
		const audioServiceUnavailable =
			error instanceof AudioServiceUnavailableError;

		if (audioServiceUnavailable) {
			console.warn('A command was rejected because Lavalink is unavailable.', {
				event: 'command-audio-unavailable',
				command: commandName,
				guildId: message.guildId,
				error,
			});
		} else {
			console.error('Unexpected command failure.', {
				event: 'command-error',
				command: commandName,
				guildId: message.guildId,
				error,
			});
		}

		await reply(
			message,
			audioServiceUnavailable
				? 'The audio service is unavailable. Try again later.'
				: 'Something went wrong while handling that command.',
		);
	}
}
