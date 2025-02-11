# EJ-Bot

EJ-Bot is a Discord bot designed to enhance your server experience with various features and commands.

## Features

- 🎵 Music playback from various sources
- 🤖 Chat functionality powered by GPT
- 📚 Dictionary word definitions
- ➕ More features in development

## Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/yourusername/EJ-Bot.git
    ```

2. Create and activate a virtual environment:
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

3. Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

4. Create a `.env` file in the root directory:
    ```
    DISCORD_TOKEN=your_discord_token
    GEMINI_TOKEN=your_gemini_token
    ```

5. Replace the tokens in `.env` with your actual Discord and Gemini API tokens.

## Lavalink Configuration

1. Download and set up Lavalink:
    ```bash
    curl -O https://github.com/freyacodes/Lavalink/releases/download/<VERSION>/Lavalink.jar
    ```
    Replace `<VERSION>` with the latest version

2. Create `application.yml` in the same directory:
    ```yaml
    server:
      port: 2333
      address: 127.0.0.1
    lavalink:
      server:
         password: "youshallnotpass"
         sources:
            youtube: true
            bandcamp: true
            soundcloud: true
            twitch: true
            vimeo: true
         bufferDurationMs: 400
         frameBufferDurationMs: 1000
    ```

## Usage

1. Invite the bot to your server using the following link:
    ```
    https://discord.com/oauth2/authorize?client_id=your-client-id&permissions=603604003444800&integration_type=0&scope=bot
    ```
    Replace `your-client-id` with your bot's client ID.

2. Start the Lavalink server:
    ```bash
    java -jar Lavalink.jar
    ```

3. Run `Main.py`

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
