import { env } from 'node:process';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ quiet: true });

type Environment = Readonly<Record<string, string | undefined>>;

export interface DiscordConfig {
	discordToken: string;
}

export interface LavalinkConfig {
	host: string;
	port: number;
	password: string;
	secure: boolean;
}

export interface MusicConfig {
	enabled: true;
	emptyChannelGraceMs: number;
}

export interface DisabledMusicConfig {
	enabled: false;
}

export type RuntimeConfig = DiscordConfig & {
	lavalink: LavalinkConfig;
	music: MusicConfig;
} | DiscordConfig & {
	lavalink: null;
	music: DisabledMusicConfig;
};

const DEFAULT_EMPTY_CHANNEL_GRACE_MS = 30_000;

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

function optionalBoolean(
	environment: Environment,
	name: string,
	defaultValue: boolean,
): boolean {
	if (environment[name] === undefined) {
		return defaultValue;
	}

	return requireBoolean(environment, name);
}

function optionalPositiveInteger(
	environment: Environment,
	name: string,
	defaultValue: number,
): number {
	const value = environment[name]?.trim();

	if (value === undefined || value === '') {
		return defaultValue;
	}

	if (!/^\d+$/.test(value)) {
		throw new Error(`${name} must be a positive integer.`);
	}

	const parsed = Number(value);

	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		throw new Error(`${name} must be a positive integer.`);
	}

	return parsed;
}

function loadDiscordConfig(environment: Environment): DiscordConfig {
	return Object.freeze({
		discordToken: requireString(environment, 'DISCORD_TOKEN'),
	});
}

export function loadRuntimeConfig(
	environment: Environment = env,
): RuntimeConfig {
	const discord = loadDiscordConfig(environment);
	const musicEnabled = optionalBoolean(
		environment,
		'MUSIC_ENABLED',
		false,
	);

	if (!musicEnabled) {
		return Object.freeze({
			...discord,
			lavalink: null,
			music: Object.freeze({
				enabled: false,
			}),
		});
	}

	return Object.freeze({
		...discord,
		lavalink: Object.freeze({
			host: requireString(environment, 'LAVALINK_HOST'),
			port: requirePort(environment),
			password: requireString(environment, 'LAVALINK_PASSWORD'),
			secure: requireBoolean(environment, 'LAVALINK_SECURE'),
		}),
		music: Object.freeze({
			enabled: true,
			emptyChannelGraceMs: optionalPositiveInteger(
				environment,
				'MUSIC_EMPTY_CHANNEL_GRACE_MS',
				DEFAULT_EMPTY_CHANNEL_GRACE_MS,
			),
		}),
	});
}
