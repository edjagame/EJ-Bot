import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRuntimeConfig } from '../src/config.js';

const validEnvironment = {
	DISCORD_TOKEN: 'discord-secret',
	LAVALINK_HOST: '127.0.0.1',
	LAVALINK_PORT: '2333',
	LAVALINK_PASSWORD: 'lavalink-secret',
	LAVALINK_SECURE: 'false',
} as const;

test('loads and converts a valid runtime configuration', () => {
	assert.deepEqual(loadRuntimeConfig(validEnvironment), {
		discordToken: 'discord-secret',
		lavalink: {
			host: '127.0.0.1',
			port: 2333,
			password: 'lavalink-secret',
			secure: false,
		},
		music: {
			emptyChannelGraceMs: 30_000,
		},
	});
});

for (const name of Object.keys(validEnvironment)) {
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
				assert.doesNotMatch(error.message, /discord-secret|lavalink-secret/);
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
