import os
import discord
from dotenv import load_dotenv
from discord.ext import bridge

intents = discord.Intents()
intents.message_content = True
bot = bridge.Bot(command_prefix=">", intents=intents)
cogs_list = [
    'Fun',
]
for cog in cogs_list:
    bot.load_extension(f'cogs.{cog}')

@bot.event
async def on_ready():
    print(f"{bot.user} is ready and online!")

load_dotenv()
bot.run(os.getenv('TOKEN'))
