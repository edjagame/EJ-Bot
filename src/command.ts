import type { Message } from 'discord.js';
import type { MusicService } from './music/music-service.js';

export const COMMAND_PREFIX = 'e!';

export type CommandFeature = 'music';

export interface CommandContext {
	music: MusicService | null;
	commands: ReadonlyMap<string, Command>;
	enabledFeatures: ReadonlySet<CommandFeature>;
}

export interface Command {
	name: string;
	description: string;
	usage: string;
	guildOnly?: boolean;
	feature?: CommandFeature;
	execute(
		message: Message,
		args: readonly string[],
		context: CommandContext,
	): Promise<void>;
}

export function isCommandEnabled(
	command: Command,
	context: CommandContext,
): boolean {
	return (
		command.feature === undefined ||
		context.enabledFeatures.has(command.feature)
	);
}

export function requireMusicService(
	music: MusicService | null,
): MusicService {
	if (!music) {
		throw new Error(
			'A music command was executed while the music feature was disabled.',
		);
	}

	return music;
}
