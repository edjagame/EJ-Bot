# DigitalOcean Droplet deployment

This deployment runs the Discord bot and Lavalink in one Docker Compose
stack. Neither service accepts public inbound traffic. Lavalink is reachable
only by the bot over the private Compose network.

## 1. Create and secure the Droplet

Create an Ubuntu 24.04 LTS Droplet with an SSH key. Start with at least 2 GB
of RAM because Lavalink runs on the JVM; monitor memory and resize if the node
regularly approaches its limit. Enable DigitalOcean monitoring and backups if
the recovery requirements justify them.

Attach a DigitalOcean Cloud Firewall with:

- inbound TCP port 22 from your administrator IP only;
- no other inbound rules; and
- outbound TCP, UDP, and ICMP allowed.

The bot needs outbound HTTPS/WebSocket, DNS, and Discord voice traffic.
Lavalink port 2333 must not be opened in either the Cloud Firewall or the
host firewall.

DigitalOcean documents its
[recommended Droplet setup](https://docs.digitalocean.com/products/droplets/getting-started/recommended-droplet-setup/)
and
[Cloud Firewall creation](https://docs.digitalocean.com/products/networking/firewalls/how-to/create/).

## 2. Install Docker

Connect as the sudo-capable account and install Docker Engine from Docker's
official apt repository. Use the current commands in Docker's
[Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/),
including the `docker-compose-plugin` package. Do not use Docker's convenience
script for a production host.

Verify the installation:

```sh
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

The commands below use `sudo docker`. Adding an account to the `docker` group
effectively grants it root-level control over the host and is not required.

## 3. Install and configure EJ Bot

Install Git, clone the repository, and enter the checkout:

```sh
sudo apt-get update
sudo apt-get install -y git
sudo mkdir -p /opt/ej-bot
sudo chown "$USER:$USER" /opt/ej-bot
git clone https://github.com/edjagame/EJ-Bot.git /opt/ej-bot
cd /opt/ej-bot
```

Create the production environment file:

```sh
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
nano .env
```

Use the generated value as `LAVALINK_PASSWORD`, then set:

```dotenv
DISCORD_TOKEN=replace_with_the_discord_bot_token
LAVALINK_PASSWORD=replace_with_the_generated_password
MUSIC_EMPTY_CHANNEL_GRACE_MS=30000
YOUTUBE_OAUTH_ENABLED=false
YOUTUBE_OAUTH_REFRESH_TOKEN=
YOUTUBE_OAUTH_SKIP_INITIALIZATION=false
```

The Compose stack supplies `LAVALINK_HOST`, `LAVALINK_PORT`, and
`LAVALINK_SECURE`; values for those keys in `.env` are overridden inside the
bot container. Keep `.env` out of Git and rotate both credentials if it is
ever exposed.

Before starting the bot, enable **Message Content Intent** on the
application's Bot page in the Discord Developer Portal. The bot cannot read
`e!` commands without this privileged intent.

## 4. Build and start

Validate and build the stack:

```sh
sudo docker compose config --quiet
sudo docker compose build --pull
```

Start and inspect the services:

```sh
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail 100 bot lavalink
```

Expected state:

- `lavalink-plugins-init` has exited successfully;
- `lavalink` is running and healthy; and
- `bot` is running and logs `Ready! Logged in as ...`.

Complete the
[manual Discord acceptance checklist](manual-acceptance.md) against the
deployed commit.

## YouTube playback from a Droplet

YouTube may reject anonymous playback from a datacenter IP even when the same
video works from a residential local connection. Confirm that this is the
failure before enabling authentication:

```sh
sudo docker compose logs --since 15m lavalink \
  | grep -Ei 'confirm|login|required|403|all clients|youtube'
```

Messages such as `Sign in to confirm you're not a bot`, `This video requires
login`, or all YouTube clients failing with HTTP 403 indicate this class of
failure. Other errors need to be diagnosed from the complete Lavalink and bot
logs instead.

The YouTube plugin supports
[OAuth as a mitigation](https://github.com/lavalink-devs/youtube-source#using-oauth-tokens),
but its maintainers warn that it can trigger rate limits or account
termination. Use a dedicated account, never a personal YouTube account. OAuth
is not guaranteed to repair a blocked IP.

To perform the one-time device authorization, set these values in `.env`:

```dotenv
YOUTUBE_OAUTH_ENABLED=true
YOUTUBE_OAUTH_REFRESH_TOKEN=
YOUTUBE_OAUTH_SKIP_INITIALIZATION=false
```

Recreate Lavalink and follow its logs:

```sh
sudo docker compose up -d --force-recreate lavalink
sudo docker compose logs -f lavalink
```

Open the device-authorization URL shown in the log, enter its code, and
authorize the dedicated account. Lavalink then logs a refresh token. Put that
token in `.env`, set initialization to be skipped, and recreate the service:

```dotenv
YOUTUBE_OAUTH_ENABLED=true
YOUTUBE_OAUTH_REFRESH_TOKEN=replace_with_the_generated_refresh_token
YOUTUBE_OAUTH_SKIP_INITIALIZATION=true
```

```sh
chmod 600 .env
sudo docker compose up -d --force-recreate lavalink
sudo docker compose ps
```

The second recreation removes the bootstrap container whose logs contained
the refresh token. Do not paste the token into Git, issue reports, or chat.
If OAuth is not required, leave it disabled.

## Operations

Deploy an update:

```sh
cd /opt/ej-bot
git pull --ff-only
sudo docker compose build --pull
sudo docker compose up -d --remove-orphans
sudo docker compose ps
```

Inspect logs and restart the stack:

```sh
sudo docker compose logs --tail 200 bot lavalink
sudo docker compose restart
```

The Compose services use `restart: unless-stopped`, so Docker restarts them
after a process failure or host reboot. Container logs rotate at 10 MB with
three retained files per service.

Before an OS reboot or Docker upgrade, confirm that no active Discord playback
session is in progress. Keep the OS and Docker Engine patched, and review the
Lavalink and YouTube plugin release notes before changing their pinned image
or plugin versions.
