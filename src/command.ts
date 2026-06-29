import type {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';
import type { MusicService } from './music/music-service.js';

export interface CommandContext {
	music: MusicService;
}

export interface Command {
	data: SlashCommandBuilder;
	execute(
		interaction: ChatInputCommandInteraction,
		context: CommandContext,
	): Promise<void>;
}
