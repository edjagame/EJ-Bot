# EJ Bot

EJ Bot is a TypeScript Discord bot built with `discord.js`. Its music
commands play YouTube video and playlist URLs through a separately operated
Lavalink v4 node.

Operators are responsible for complying with YouTube's terms and for ensuring
that they have the right to play requested content.

## Prerequisites

- Node.js 24 LTS and npm
- Docker Engine with Docker Compose for the supplied Lavalink deployment
- A Discord application and test guild

Install the locked Node.js dependencies:

```sh
npm ci
```

## Configuration

Copy `.env.example` to `.env` and replace every runtime placeholder:

```dotenv
DISCORD_TOKEN=bot_token
CLIENT_ID=application_id
TEST_SERVER_ID=test_server_id
LAVALINK_HOST=127.0.0.1
LAVALINK_PORT=2333
LAVALINK_PASSWORD=replace_with_a_strong_unique_password
LAVALINK_SECURE=false
MUSIC_EMPTY_CHANNEL_GRACE_MS=30000
```

The bot validates configuration at startup. `LAVALINK_PORT` must be an
integer from `1` through `65535`, `LAVALINK_SECURE` must be exactly `true` or
`false`, and the empty-channel grace period must be a positive integer in
milliseconds.

The project `.env` file is ignored by Git. Do not commit it, paste it into
logs, bake it into an image, or reuse either service password elsewhere. On a
host, restrict the file to the bot's operating account. In managed production
environments, inject values from the platform's secret manager and rotate the
Discord token or Lavalink password immediately if either is exposed.

## Local startup

The supplied Compose deployment runs Lavalink `4.2.2` with `youtube-source`
`1.18.1`. Built-in YouTube support, search, bare IDs, OAuth, and
proof-of-origin tokens are disabled.

Start and verify Lavalink before starting the Discord bot:

```sh
docker compose --env-file .env -f lavalink/compose.yml config --quiet
docker compose --env-file .env -f lavalink/compose.yml up -d
docker compose --env-file .env -f lavalink/compose.yml ps
```

Query the authenticated health endpoint. In PowerShell:

```powershell
$password = (Get-Content .env |
  Where-Object { $_ -match '^LAVALINK_PASSWORD=' } |
  Select-Object -First 1) -replace '^LAVALINK_PASSWORD=', ''

curl.exe -fsS -H "Authorization: $password" http://127.0.0.1:2333/v4/info
```

The response should identify Lavalink `4.2.2` and the YouTube plugin
`1.18.1`. A `401` response means the password is wrong. A connection failure
means the node is not listening at the configured address.

Deploy commands to the configured test guild:

```sh
npm run deploy
```

Guild deployment is intentionally the default because changes become
available quickly during development. Production promotion must be a separate
reviewed operation using `Routes.applicationCommands(CLIENT_ID)`; do not
change the default script to deploy globally.

Start the bot after the Lavalink health check and command deployment:

```sh
npm run dev
```

For production, build first and run the compiled output:

```sh
npm run build
npm start
```

A Lavalink outage does not stop utility commands. The bot bounds connection
and load attempts, logs the failure without configured credentials, and tells
music-command users that the audio service is unavailable.

## Tests and continuous integration

Run deterministic checks locally:

```sh
npm run typecheck
npm run test:unit
npm run build
```

`npm test` is an alias for the unit suite. Pull requests and pushes to `main`
run the same type-check, unit-test, and production-build checks in GitHub
Actions. CI does not receive Discord or Lavalink secrets and does not call
YouTube.

Live Lavalink tests are deliberately opt-in. Add three current, replaceable
fixtures to the untracked `.env` file:

```dotenv
LAVALINK_TEST_VIDEO_URL=https://www.youtube.com/watch?v=playable_video
LAVALINK_TEST_PLAYLIST_URL=https://www.youtube.com/playlist?list=playable_playlist
LAVALINK_TEST_UNAVAILABLE_VIDEO_URL=https://www.youtube.com/watch?v=unavailable_video
```

The video must be public and playable, the playlist must contain playable
entries in a stable order, and the unavailable fixture must remain a
well-formed YouTube video URL that cannot be played. With Lavalink healthy,
run:

```sh
npm run test:integration
```

The suite authenticates the TypeScript client, loads the fixtures, confirms
search is disabled, checks application error mapping, and verifies the
connection timeout. `[INTEGRATION_SETUP]` failures indicate missing or
incorrect local configuration. `[UPSTREAM_FIXTURE]` failures mean YouTube
stopped serving a fixture as expected; replace the fixture before treating
that result as a bot regression.

## Operations and logs

Inspect Lavalink status and recent logs:

```sh
docker compose --env-file .env -f lavalink/compose.yml ps
docker compose --env-file .env -f lavalink/compose.yml logs --no-color --tail 200 lavalink
```

The bot logs lifecycle records with event names such as `node-connect`,
`node-error`, `track-error`, `guild-cleanup`, and `process-shutdown`.
Correlate incidents using the event name, guild ID, and node context. Log
output must never be augmented with the Discord token, Lavalink password, or
raw environment object.

Stop the local node when it is no longer needed:

```sh
docker compose --env-file .env -f lavalink/compose.yml down
```

## Hosted Lavalink security

The supplied Compose file publishes port `2333` only on `127.0.0.1`, which is
the correct default when the bot and Lavalink share a host. For separate
hosts, prefer a private network or VPN and point `LAVALINK_HOST` at the
private address.

Do not expose Lavalink directly to the public internet. If remote access is
unavoidable:

1. Allow inbound traffic only from the bot host's fixed source address.
2. Keep a strong unique Lavalink password and rotate it periodically.
3. Terminate TLS at a maintained reverse proxy or load balancer.
4. Set `LAVALINK_SECURE=true` and use the TLS endpoint from the bot.
5. Keep the Lavalink management and container-host ports blocked publicly.
6. Verify `/v4/info` with authentication from the bot host, then verify that
   the endpoint is unreachable from an unauthorized network.

Use the same startup order in hosted environments: start Lavalink, verify its
authenticated health endpoint and plugin versions, deploy Discord commands,
then start the bot. Configure both processes under a supervisor with restart
policies and retain sanitized logs for incident diagnosis.

## Release acceptance

Automated checks are necessary but cannot verify audible Discord playback.
Complete and sign [the manual Discord acceptance checklist](docs/manual-acceptance.md)
against the exact commit being released.
