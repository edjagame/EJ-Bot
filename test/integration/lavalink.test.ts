import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import type { Client } from 'discord.js';
import { config as loadDotenv } from 'dotenv';
import {
	LavalinkAudioAdapter,
	type AudioLoadResult,
} from '../../src/music/audio-adapter.js';
import {
	MusicService,
	VideoUnavailableError,
} from '../../src/music/music-service.js';
import { parseYouTubeUrl } from '../../src/music/youtube-url.js';

loadDotenv({ quiet: true });

const PLAYER_GUILD_ID = '100000000000000001';
const PLAYER_VOICE_CHANNEL_ID = '100000000000000002';
const PLAYER_TEXT_CHANNEL_ID = '100000000000000003';
const UNAVAILABLE_GUILD_ID = '100000000000000004';
const CONNECTION_TIMEOUT_LIMIT_MS = 15_000;

interface IntegrationConfiguration {
	readonly lavalink: {
		readonly host: string;
		readonly port: number;
		readonly password: string;
		readonly secure: boolean;
	};
	readonly videoUrl: string;
	readonly playlistUrl: string;
	readonly unavailableVideoUrl: string;
}

function requiredEnvironment(name: string): string {
	const value = process.env[name]?.trim();

	if (!value) {
		throw new Error(
			`[INTEGRATION_SETUP] ${name} is required by npm run test:integration.`,
		);
	}

	return value;
}

function loadIntegrationConfiguration(): IntegrationConfiguration {
	const portValue = requiredEnvironment('LAVALINK_PORT');
	const port = Number(portValue);
	const secureValue = requiredEnvironment('LAVALINK_SECURE');

	if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
		throw new Error(
			'[INTEGRATION_SETUP] LAVALINK_PORT must be an integer from 1 through 65535.',
		);
	}

	if (secureValue !== 'true' && secureValue !== 'false') {
		throw new Error(
			'[INTEGRATION_SETUP] LAVALINK_SECURE must be either true or false.',
		);
	}

	return {
		lavalink: {
			host: requiredEnvironment('LAVALINK_HOST'),
			port,
			password: requiredEnvironment('LAVALINK_PASSWORD'),
			secure: secureValue === 'true',
		},
		videoUrl: requiredEnvironment('LAVALINK_TEST_VIDEO_URL'),
		playlistUrl: requiredEnvironment('LAVALINK_TEST_PLAYLIST_URL'),
		unavailableVideoUrl: requiredEnvironment(
			'LAVALINK_TEST_UNAVAILABLE_VIDEO_URL',
		),
	};
}

function fakeDiscordClient(): Client {
	return {
		guilds: {
			cache: new Map(),
		},
	} as unknown as Client;
}

function assertPlayableFixture(
	result: AudioLoadResult,
	expectedType: 'track' | 'playlist',
	name: string,
): void {
	assert.equal(
		result.loadType,
		expectedType,
		`[UPSTREAM_FIXTURE] ${name} returned ${result.loadType}, not ${expectedType}. Replace the configured fixture if YouTube no longer serves it.`,
	);
	assert(
		result.tracks.length > 0,
		`[UPSTREAM_FIXTURE] ${name} returned no playable tracks. Replace the configured fixture if YouTube no longer serves it.`,
	);
}

async function loadRawPlaylistUrls(
	configuration: IntegrationConfiguration,
): Promise<readonly string[]> {
	const protocol = configuration.lavalink.secure ? 'https' : 'http';
	const endpoint = new URL(
		`/v4/loadtracks?identifier=${encodeURIComponent(configuration.playlistUrl)}`,
		`${protocol}://${configuration.lavalink.host}:${configuration.lavalink.port}`,
	);
	const response = await fetch(endpoint, {
		headers: {
			Authorization: configuration.lavalink.password,
		},
		signal: AbortSignal.timeout(10_000),
	});

	assert.equal(
		response.ok,
		true,
		`[INTEGRATION_SETUP] Lavalink REST request failed with HTTP ${response.status}.`,
	);

	const body = (await response.json()) as {
		loadType?: unknown;
		data?: {
			tracks?: Array<{
				encoded?: unknown;
				info?: {
					title?: unknown;
					uri?: unknown;
					duration?: unknown;
				};
			}>;
		};
	};
	assert.equal(
		body.loadType,
		'playlist',
		'[UPSTREAM_FIXTURE] The playlist fixture did not produce a Lavalink playlist response.',
	);
	assert(Array.isArray(body.data?.tracks));

	return body.data.tracks.flatMap((track): string[] => {
		const info = track.info;

		if (
			typeof track.encoded !== 'string' ||
			track.encoded.length === 0 ||
			typeof info?.title !== 'string' ||
			info.title.length === 0 ||
			typeof info.uri !== 'string' ||
			info.uri.length === 0 ||
			typeof info.duration !== 'number' ||
			!Number.isFinite(info.duration) ||
			info.duration < 0
		) {
			return [];
		}

		return [info.uri];
	});
}

async function reserveClosedPort(): Promise<number> {
	const server = createServer();

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});

	const address = server.address();
	assert(address && typeof address === 'object');
	const port = address.port;

	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});

	return port;
}

test(
	'Lavalink integration: client, URL loading, disabled search, and timeout',
	{ timeout: 45_000 },
	async (context) => {
		const configuration = loadIntegrationConfiguration();
		const audio = new LavalinkAudioAdapter(
			fakeDiscordClient(),
			configuration.lavalink,
		);

		try {
			const connected = await audio.initialize({
				id: '100000000000000000',
				username: 'phase-8-integration',
			});
			assert.equal(
				connected,
				true,
				'[INTEGRATION_SETUP] Could not authenticate and connect to Lavalink.',
			);

			await audio.createPlayer({
				guildId: PLAYER_GUILD_ID,
				voiceChannelId: PLAYER_VOICE_CHANNEL_ID,
				textChannelId: PLAYER_TEXT_CHANNEL_ID,
			});

			await context.test('loads a public YouTube video URL', async () => {
				const parsed = parseYouTubeUrl(configuration.videoUrl);
				assert.equal(
					parsed?.kind,
					'video',
					'[INTEGRATION_SETUP] LAVALINK_TEST_VIDEO_URL must be a valid YouTube video URL.',
				);

				const result = await audio.load(
					PLAYER_GUILD_ID,
					configuration.videoUrl,
					'integration-user',
				);
				assertPlayableFixture(result, 'track', 'video fixture');
			});

			await context.test(
				'loads a public playlist and preserves returned order',
				async () => {
					const parsed = parseYouTubeUrl(configuration.playlistUrl);
					assert.equal(
						parsed?.kind,
						'playlist',
						'[INTEGRATION_SETUP] LAVALINK_TEST_PLAYLIST_URL must be a valid YouTube playlist URL.',
					);

					const rawUrls = await loadRawPlaylistUrls(configuration);
					const result = await audio.load(
						PLAYER_GUILD_ID,
						configuration.playlistUrl,
						'integration-user',
					);
					assertPlayableFixture(result, 'playlist', 'playlist fixture');

					assert.deepEqual(
						result.tracks.map((track) => track.url),
						rawUrls,
						'[UPSTREAM_FIXTURE] Consecutive playlist loads returned different playable order, or the client mapping changed Lavalink order.',
					);
				},
			);

			await context.test('keeps plain-text search disabled', async () => {
				const result = await audio.load(
					PLAYER_GUILD_ID,
					'ytsearch:phase eight integration fixture',
					'integration-user',
				);

				assert.equal(result.tracks.length, 0);
				assert.notEqual(result.loadType, 'track');
				assert.notEqual(result.loadType, 'playlist');
			});

			await context.test(
				'maps unavailable content to the application error',
				async () => {
					const parsed = parseYouTubeUrl(
						configuration.unavailableVideoUrl,
					);
					assert.equal(
						parsed?.kind,
						'video',
						'[INTEGRATION_SETUP] LAVALINK_TEST_UNAVAILABLE_VIDEO_URL must be a valid YouTube video URL.',
					);

					const music = new MusicService(audio);
					await assert.rejects(
						music.play({
							guildId: UNAVAILABLE_GUILD_ID,
							voiceChannelId: PLAYER_VOICE_CHANNEL_ID,
							textChannelId: PLAYER_TEXT_CHANNEL_ID,
							url: configuration.unavailableVideoUrl,
							urlKind: 'video',
							requestedBy: 'integration-user',
						}),
						(error: unknown) => {
							assert(
								error instanceof VideoUnavailableError,
								'[UPSTREAM_FIXTURE] The unavailable-video fixture became playable or produced an unexpected response. Replace it.',
							);
							return true;
						},
					);
				},
			);
		} finally {
			await audio.destroyPlayer(PLAYER_GUILD_ID);
			await audio.destroyPlayer(UNAVAILABLE_GUILD_ID);
			await audio.shutdown();
		}

		await context.test(
			'returns within the configured connection timeout when unavailable',
			async () => {
				const port = await reserveClosedPort();
				const unavailableAudio = new LavalinkAudioAdapter(
					fakeDiscordClient(),
					{
						host: '127.0.0.1',
						port,
						password: 'phase-8-unavailable-node',
						secure: false,
					},
				);
				const startedAt = Date.now();

				try {
					const connected = await unavailableAudio.initialize({
						id: '100000000000000000',
						username: 'phase-8-integration',
					});
					assert.equal(connected, false);
					assert(
						Date.now() - startedAt <= CONNECTION_TIMEOUT_LIMIT_MS,
						`Audio initialization exceeded ${CONNECTION_TIMEOUT_LIMIT_MS}ms.`,
					);
				} finally {
					await unavailableAudio.shutdown();
				}
			},
		);
	},
);
