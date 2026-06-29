import type { Message } from 'discord.js';
import type { MusicService } from './music/music-service.js';

export const COMMAND_PREFIX = 'e!';

export interface CommandContext {
	music: MusicService;
	commands: ReadonlyMap<string, Command>;
}

export interface Command {
	name: string;
	description: string;
	usage: string;
	guildOnly?: boolean;
	execute(
		message: Message,
		args: readonly string[],
		context: CommandContext,
	): Promise<void>;
}
