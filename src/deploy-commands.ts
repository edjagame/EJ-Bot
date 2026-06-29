import { REST, Routes } from 'discord.js';
import { loadDeployConfig } from './config.js';
import { loadCommands } from './load-commands.js';

async function deployCommands(): Promise<void> {
	const { discordToken, clientId, testServerId } = loadDeployConfig();
	const commands = await loadCommands();
	const body = commands.map((command) => command.data.toJSON());
	const rest = new REST().setToken(discordToken);

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
