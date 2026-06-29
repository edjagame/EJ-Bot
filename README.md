# EJ Bot

EJ Bot is a TypeScript Discord bot built with `discord.js`.

## Setup

Install dependencies:

```sh
npm install
```

Copy `.env.example` to `.env` and configure:

```dotenv
DISCORD_TOKEN=bot_token
CLIENT_ID=application_id
TEST_SERVER_ID=test_server_id
LAVALINK_PASSWORD=change_me
```

Start the bot in development:

```sh
npm run dev
```

Build and start the compiled bot:

```sh
npm run build
npm start
```

## Deploy slash commands

Deploy all valid command modules to the configured test guild:

```sh
npm run deploy
```

Guild deployment is intentionally the default because command changes become
available quickly during development. The command reports how many commands
Discord registered.

Production promotion must be deliberate. After validating commands in the test
guild, use a separately reviewed deployment that calls
`Routes.applicationCommands(CLIENT_ID)`. Do not change the default deployment
script to register commands globally; global command updates can take longer to
propagate and affect every guild that has installed the application.

## Lavalink

Lavalink is operated separately from the Discord bot. The Compose setup runs
Lavalink `4.2.2` with `youtube-source` `1.18.1`.

Set a strong, unique password in the project `.env` file:

```dotenv
LAVALINK_PASSWORD=replace_with_a_strong_password
```

Start the node from the repository root:

```sh
docker compose --env-file .env -f lavalink/compose.yml up -d
```

Follow startup and plugin download logs:

```sh
docker compose --env-file .env -f lavalink/compose.yml logs -f lavalink
```

The REST API requires the password in the `Authorization` header. For example,
in PowerShell:

```powershell
$password = (Get-Content .env |
  Where-Object { $_ -match '^LAVALINK_PASSWORD=' } |
  Select-Object -First 1) -replace '^LAVALINK_PASSWORD=', ''

curl.exe -sS -H "Authorization: $password" http://127.0.0.1:2333/v4/info
```

The info response should report Lavalink `4.2.2` and a `youtube-plugin` entry at
`1.18.1`. Use replaceable public YouTube fixtures to smoke-test loading:

```powershell
$videoUrl = [uri]::EscapeDataString('https://www.youtube.com/watch?v=VIDEO_ID')
$playlistUrl = [uri]::EscapeDataString('https://www.youtube.com/playlist?list=PLAYLIST_ID')
$search = [uri]::EscapeDataString('ytsearch:replaceable search fixture')
$bareVideoId = [uri]::EscapeDataString('VIDEO_ID')

curl.exe -sS -H "Authorization: $password" "http://127.0.0.1:2333/v4/loadtracks?identifier=$videoUrl"
curl.exe -sS -H "Authorization: $password" "http://127.0.0.1:2333/v4/loadtracks?identifier=$playlistUrl"
curl.exe -sS -H "Authorization: $password" "http://127.0.0.1:2333/v4/loadtracks?identifier=$search"
curl.exe -sS -H "Authorization: $password" "http://127.0.0.1:2333/v4/loadtracks?identifier=$bareVideoId"
```

The video and playlist responses should have `loadType` values of `track` and
`playlist`, respectively, and the playlist should contain at least one track.
Searches and bare IDs are intentionally disabled and must not return playable
search or track results. OAuth and proof-of-origin tokens are not configured.

Stop the node when it is no longer needed:

```sh
docker compose --env-file .env -f lavalink/compose.yml down
```

Port `2333` is published on `127.0.0.1` only, so hosts elsewhere on the network
cannot connect directly. The configuration remains readable inside the
container, while downloaded plugins are retained in a Docker named volume.
