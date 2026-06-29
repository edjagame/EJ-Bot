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
CLIENT_ID=replace_with_the_discord_application_id
TEST_SERVER_ID=replace_with_the_target_guild_id
LAVALINK_PASSWORD=replace_with_the_generated_password
MUSIC_EMPTY_CHANNEL_GRACE_MS=30000
```

The Compose stack supplies `LAVALINK_HOST`, `LAVALINK_PORT`, and
`LAVALINK_SECURE`; values for those keys in `.env` are overridden inside the
bot container. Keep `.env` out of Git and rotate both credentials if it is
ever exposed.

## 4. Build, register commands, and start

Validate and build the stack:

```sh
sudo docker compose config --quiet
sudo docker compose build --pull
```

Register commands in `TEST_SERVER_ID`:

```sh
sudo docker compose run --rm --no-deps bot node dist/deploy-commands.js
```

This repository deliberately registers guild commands, which appear quickly
and limit the bot to the configured guild. Do not treat `TEST_SERVER_ID` as a
secret. A bot intended for multiple guilds needs a separately reviewed global
command-registration path before deployment.

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

## Operations

Deploy an update:

```sh
cd /opt/ej-bot
git pull --ff-only
sudo docker compose build --pull
sudo docker compose run --rm --no-deps bot node dist/deploy-commands.js
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
