import discord
import requests
from discord.ext import commands

class Dictionary(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self._last_member = None
    

    # Define command
    # Usage: !define <word>, !define <word> <length> where length is the number of definitions to display
    @commands.command()
    async def define(self, ctx, word): 
        """Define a word"""
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
        except:
            await ctx.reply(f'Could not find the definition for {word.lower()}')
    
    # Gets the synonyms of a word
    @commands.command()
    async def synonym(self, ctx, word):
        pass



async def setup(bot):  
    await bot.add_cog(Dictionary(bot)) 