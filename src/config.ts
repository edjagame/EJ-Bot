import { env } from 'node:process';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ quiet: true });

type Environment = Readonly<Record<string, string | undefined>>;

export interface DiscordConfig {
	discordToken: string;
	clientId: string;
	testServerId: string;
}

export interface LavalinkConfig {
	host: string;
	port: number;
	password: string;
	secure: boolean;
}

export interface RuntimeConfig extends DiscordConfig {
	lavalink: LavalinkConfig;
}

function requireString(environment: Environment, name: string): string {
	const value = environment[name]?.trim();

	if (!value) {
		throw new Error(`${name} is not set.`);
	}

	return value;
}

function requirePort(environment: Environment): number {
	const value = requireString(environment, 'LAVALINK_PORT');

	if (!/^\d+$/.test(value)) {
		throw new Error(
			'LAVALINK_PORT must be an integer from 1 through 65535.',
		);
	}

	const port = Number(value);

	if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
		throw new Error(
			'LAVALINK_PORT must be an integer from 1 through 65535.',
		);
	}

	return port;
}

function requireBoolean(environment: Environment, name: string): boolean {
	const value = requireString(environment, name);

	if (value === 'true') {
		return true;
	}

	if (value === 'false') {
		return false;
	}

	throw new Error(`${name} must be either true or false.`);
}

export function loadDeployConfig(
	environment: Environment = env,
): DiscordConfig {
	return Object.freeze({
		discordToken: requireString(environment, 'DISCORD_TOKEN'),
		clientId: requireString(environment, 'CLIENT_ID'),
		testServerId: requireString(environment, 'TEST_SERVER_ID'),
	});
}

export function loadRuntimeConfig(
	environment: Environment = env,
): RuntimeConfig {
	const discord = loadDeployConfig(environment);

	return Object.freeze({
		...discord,
		lavalink: Object.freeze({
			host: requireString(environment, 'LAVALINK_HOST'),
			port: requirePort(environment),
			password: requireString(environment, 'LAVALINK_PASSWORD'),
			secure: requireBoolean(environment, 'LAVALINK_SECURE'),
		}),
	});
}
