import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDeployConfig, loadRuntimeConfig } from '../src/config.js';

const validEnvironment = {
	DISCORD_TOKEN: 'discord-secret',
	CLIENT_ID: 'application-id',
	TEST_SERVER_ID: 'test-server-id',
	LAVALINK_HOST: '127.0.0.1',
	LAVALINK_PORT: '2333',
	LAVALINK_PASSWORD: 'lavalink-secret',
	LAVALINK_SECURE: 'false',
} as const;

test('loads and converts a valid runtime configuration', () => {
	assert.deepEqual(loadRuntimeConfig(validEnvironment), {
		discordToken: 'discord-secret',
		clientId: 'application-id',
		testServerId: 'test-server-id',
		lavalink: {
			host: '127.0.0.1',
			port: 2333,
			password: 'lavalink-secret',
			secure: false,
		},
	});
});

test('loads deploy configuration without requiring Lavalink settings', () => {
	assert.deepEqual(
		loadDeployConfig({
			DISCORD_TOKEN: 'discord-secret',
			CLIENT_ID: 'application-id',
			TEST_SERVER_ID: 'test-server-id',
		}),
		{
			discordToken: 'discord-secret',
			clientId: 'application-id',
			testServerId: 'test-server-id',
		},
	);
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
