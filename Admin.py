import discord
from discord.ext import commands

import Ejai

class Greetings(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self._last_member = None

    @commands.Cog.listener()
    async def on_member_join(self, member):
        channel = member.guild.system_channel
        if channel is not None:
            await channel.send(f'Welcome {member.mention}!')

    @commands.command(name="hello", help="Say hello to the bot! Usage: !hello")
    async def hello(self, ctx, *, member: discord.Member = None):
        member = member or ctx.author
        if self._last_member is None or self._last_member.id != member.id:
            async with ctx.typing():
                await ctx.reply(Ejai.Ejai.respond("Hello!"))

async def setup(bot):  
    await bot.add_cog(Greetings(bot)) 