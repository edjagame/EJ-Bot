import requests
import discord
from discord.ext import bridge, commands

class Fun(commands.Cog):

    def __init__(self, bot):
        self.bot = bot

    @commands.command()
    async def curse(self, ctx, *, user):
        await ctx.message.delete()
        await ctx.send(f"Fuck you {user} 🖕")

    @bridge.bridge_command(name="define")
    async def define(self, ctx, *, query):
        try:
            data=requests.get(f"https://api.dictionaryapi.dev/api/v2/entries/en/{query}").json()[0]
            defn=""
            for i in data['meanings']:
                defn+=f"{i['partOfSpeech']} | {i['definitions'][0]['definition']}\n"
            embed=discord.Embed(
                colour=discord.Color.green(),
                title=f"Definition of {query.lower()}:",
                description=defn
            )
            await ctx.respond(embed=embed)
        except:
            await ctx.respond(f"{query.lower()} isn't in the dictionary, dumbass.")
    
def setup(bot):  # this is called by Pycord to setup the cog
    bot.add_cog(Fun(bot))  # add the cog to the bot
