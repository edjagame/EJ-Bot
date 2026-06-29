import type {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import type { MusicService } from './music/music-service.js';

export interface CommandContext {
	music: MusicService;
}

export interface Command {
	data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
	execute(
		interaction: ChatInputCommandInteraction,
		context: CommandContext,
	): Promise<void>;
}
