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
