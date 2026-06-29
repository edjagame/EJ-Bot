import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRuntimeConfig } from '../src/config.js';

const validEnvironment = {
	DISCORD_TOKEN: 'discord-secret',
	MUSIC_ENABLED: 'true',
	LAVALINK_HOST: '127.0.0.1',
	LAVALINK_PORT: '2333',
	LAVALINK_PASSWORD: 'lavalink-secret',
	LAVALINK_SECURE: 'false',
} as const;

test('disables music by default without requiring Lavalink configuration', () => {
	assert.deepEqual(
		loadRuntimeConfig({
			DISCORD_TOKEN: 'discord-secret',
		}),
		{
			discordToken: 'discord-secret',
			lavalink: null,
			music: {
				enabled: false,
			},
		},
	);
});

test('ignores Lavalink configuration while music is explicitly disabled', () => {
	assert.deepEqual(
		loadRuntimeConfig({
			DISCORD_TOKEN: 'discord-secret',
			MUSIC_ENABLED: 'false',
			LAVALINK_PORT: 'not-a-port',
			MUSIC_EMPTY_CHANNEL_GRACE_MS: 'not-a-number',
		}),
		{
			discordToken: 'discord-secret',
			lavalink: null,
			music: {
				enabled: false,
			},
		},
	);
});

for (const enabled of ['', 'TRUE', 'yes', '0']) {
	test(`rejects invalid music enabled value ${JSON.stringify(enabled)}`, () => {
		assert.throws(
			() =>
				loadRuntimeConfig({
					DISCORD_TOKEN: 'discord-secret',
					MUSIC_ENABLED: enabled,
				}),
			/MUSIC_ENABLED must be either true or false|MUSIC_ENABLED is not set/,
		);
	});
}

test('loads and converts an enabled music configuration', () => {
	assert.deepEqual(loadRuntimeConfig(validEnvironment), {
		discordToken: 'discord-secret',
		lavalink: {
			host: '127.0.0.1',
			port: 2333,
			password: 'lavalink-secret',
			secure: false,
		},
		music: {
			enabled: true,
			emptyChannelGraceMs: 30_000,
		},
	});
});

for (const name of [
	'DISCORD_TOKEN',
	'LAVALINK_HOST',
	'LAVALINK_PORT',
	'LAVALINK_PASSWORD',
	'LAVALINK_SECURE',
] as const) {
	test(`rejects a missing ${name} without exposing another secret`, () => {
		const environment: Record<string, string | undefined> = {
			...validEnvironment,
			[name]: ' ',
		};

		assert.throws(
			() => loadRuntimeConfig(environment),
			(error: unknown) => {
				assert(error instanceof Error);
				assert.match(error.message, new RegExp(name));
				assert.doesNotMatch(
					error.message,
					/discord-secret|lavalink-secret/,
				);
				return true;
			},
		);
	});
}

for (const port of ['0', '65536', '1.5', '-1', 'not-a-port']) {
	test(`rejects invalid Lavalink port ${port}`, () => {
		assert.throws(
			() =>
				loadRuntimeConfig({
					...validEnvironment,
					LAVALINK_PORT: port,
				}),
			/LAVALINK_PORT must be an integer from 1 through 65535/,
		);
	});
}

test('accepts secure Lavalink connections', () => {
	const result = loadRuntimeConfig({
		...validEnvironment,
		LAVALINK_SECURE: 'true',
	});

	assert(result.lavalink);
	assert.equal(result.lavalink.secure, true);
});

for (const secure of ['TRUE', 'yes', '0']) {
	test(`rejects invalid Lavalink secure value ${secure}`, () => {
		assert.throws(
			() =>
				loadRuntimeConfig({
					...validEnvironment,
					LAVALINK_SECURE: secure,
				}),
			/LAVALINK_SECURE must be either true or false/,
		);
	});
}

test('accepts an explicit empty-channel grace period', () => {
	const result = loadRuntimeConfig({
		...validEnvironment,
		MUSIC_EMPTY_CHANNEL_GRACE_MS: '45000',
	});

	assert(result.music.enabled);
	assert.equal(result.music.emptyChannelGraceMs, 45_000);
});

for (const grace of ['0', '-1', '1.5', 'not-a-number']) {
	test(`rejects invalid empty-channel grace period ${grace}`, () => {
		assert.throws(
			() =>
				loadRuntimeConfig({
					...validEnvironment,
					MUSIC_EMPTY_CHANNEL_GRACE_MS: grace,
				}),
			/MUSIC_EMPTY_CHANNEL_GRACE_MS must be a positive integer/,
		);
	});
}
