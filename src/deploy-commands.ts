import { env } from 'node:process';
import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { loadCommands } from './load-commands.js';

function requireEnvironmentVariable(name: string): string {
	const value = env[name];

	if (!value?.trim()) {
		throw new Error(`${name} is not set.`);
	}

	return value;
}

async function deployCommands(): Promise<void> {
	config();

	const token = requireEnvironmentVariable('DISCORD_TOKEN');
	const clientId = requireEnvironmentVariable('CLIENT_ID');
	const testServerId = requireEnvironmentVariable('TEST_SERVER_ID');
	const commands = await loadCommands();
	const body = commands.map((command) => command.data.toJSON());
	const rest = new REST().setToken(token);

	console.log(
		`Deploying ${body.length} command(s) to test guild ${testServerId}...`,
	);

	const deployedCommands = await rest.put(
		Routes.applicationGuildCommands(clientId, testServerId),
		{ body },
	);

	if (!Array.isArray(deployedCommands)) {
		throw new Error('Discord returned an unexpected command deployment response.');
	}

	console.log(
		`Successfully deployed ${deployedCommands.length} command(s) to test guild ${testServerId}.`,
	);
}

try {
	await deployCommands();
} catch (error) {
	const message =
		error instanceof Error
			? error.message.trim() || error.name || 'Unknown error'
			: String(error) || 'Unknown error';
	console.error(`Failed to deploy commands: ${message}`);
	process.exitCode = 1;
}
