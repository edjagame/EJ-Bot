import os

import random

import discord
from discord.ext import commands

from dotenv import load_dotenv
load_dotenv()

intents = discord.Intents.default()
intents.members = True
intents.message_content = True

bot = commands.Bot(command_prefix='!', intents=intents)

async def load_extensions():
    extensions = ['Admin', 'Dictionary', 'Ejai', 'Music']
    for extension in extensions:
        await bot.load_extension(extension)
        print(f'Loaded {extension}')

@bot.event
async def on_ready():
    print(f'Logged in as {bot.user.name} ({bot.user.id})')
    await load_extensions()
    print('Bot is ready!')


# Run bot
if __name__ == '__main__':
    bot.run(os.getenv('DISCORD_TOKEN'))
