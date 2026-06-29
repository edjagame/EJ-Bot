import { readdir } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Collection } from 'discord.js';
import type { Command } from './command.js';

function isCommand(value: unknown): value is Command {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as Partial<Command>;

	return (
		typeof candidate.name === 'string' &&
		typeof candidate.description === 'string' &&
		typeof candidate.usage === 'string' &&
		typeof candidate.execute === 'function'
	);
}

export async function loadCommands(): Promise<Collection<string, Command>> {
	const currentFilePath = fileURLToPath(import.meta.url);
	const commandsPath = join(dirname(currentFilePath), 'commands');
	const commandExtension = extname(currentFilePath);
	const commandFolders = await readdir(commandsPath, { withFileTypes: true });
	const commands = new Collection<string, Command>();

	for (const folder of commandFolders) {
		if (!folder.isDirectory()) {
			continue;
		}

		const folderPath = join(commandsPath, folder.name);
		const commandFiles = await readdir(folderPath, { withFileTypes: true });

		for (const file of commandFiles) {
			if (!file.isFile() || extname(file.name) !== commandExtension) {
				continue;
			}

			const filePath = join(folderPath, file.name);
			const commandModule: unknown = await import(pathToFileURL(filePath).href);
			const command =
				typeof commandModule === 'object' &&
				commandModule !== null &&
				'default' in commandModule
					? commandModule.default
					: undefined;

			if (isCommand(command)) {
				const name = command.name.toLowerCase();

				if (commands.has(name)) {
					throw new Error(`Duplicate command name "${name}".`);
				}

				commands.set(name, command);
			} else {
				console.warn(
					`[WARNING] The command at ${filePath} is missing valid metadata or an "execute" property.`,
				);
			}
		}
	}

	return commands;
}
