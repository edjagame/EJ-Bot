import discord
import requests
from discord.ext import commands


class Dictionary(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self._last_member = None
    

    # Define command
    # Usage: !define <word>, !define <word> <length> where length is the number of definitions to display
    @commands.command(name="define", help="Get the definition of a word. Usage: !define <word>")
    async def define(self, ctx, word = None):
        display = ""
        try:
            # Request data from the API and convert it to JSON
            response = requests.get(f'https://api.dictionaryapi.dev/api/v2/entries/en_US/{word}')
            data = response.json()
            
            meanings = data[0]['meanings']
            for meaning in meanings:
                display += f"**{meaning['partOfSpeech']}**\n"
                for i in range(len(meaning['definitions'])):
                    definition = meaning['definitions'][i]['definition']
                    if definition:
                        display += f"{i}. {definition}\n"

            embed=discord.Embed(
                colour=discord.Color.green(),
                title=f"{word.capitalize()}",
                description=display
            )
            await ctx.reply(embed=embed)
        except Exception as e:
            if word is None:
                await ctx.reply('Please provide a word to define')
            else:
                await ctx.reply(f'Could not find the definition for {word.lower()}')


async def setup(bot):  
    await bot.add_cog(Dictionary(bot)) 