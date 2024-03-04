import json
import os
import genshin
import discord
from discord.ext import bridge, commands

ltuid = os.environ['ltuid']
ltoken = os.environ['ltoken']

class Genshin(commands.Cog):

  def __init__(self, bot):
    self.bot = bot
    self.cookies = {"ltuid": 119480035, "ltoken": "cnF7TiZqHAAvYqgCBoSPx5EjwezOh1ZHoqSHf7dT"}
    self.client = genshin.Client(self.cookies)
  
  @bridge.bridge_command(name="uid_set")
  async def uid_set(self, ctx, *, uid):
    with open("userToUID.json", "r") as file: #reads data from file
      data = json.load(file)
      file.close()
    data[ctx.message.author.id]=uid
    with open("userToUID.json", "w") as file:
      json.dump(data, file)
      file.close()
    await ctx.respond(f"Your UID has been set to {uid}.")

  @bridge.bridge_command(name="abyss_info")
  async def abyss_info(self, ctx):
    with open("userToUID.json", "r") as file:
      data = json.load(file)
      file.close()
      uid = int(data[str(ctx.message.author.id)])
      try:
        user = await self.client.get_full_genshin_user(uid)
        await ctx.respond(f"You got {user.abyss.previous.total_stars} stars in the previous abyss.")
      except:
        embed = discord.Embed(
          description="This user's battle chronicle data is not available to the public. Please change your permissions in [hoyolab.com](https://www.hoyolab.com/setting/privacy)"
        )
        await ctx.respond(embed=embed)
def setup(bot):  # this is called by Pycord to setup the cog
  bot.add_cog(Genshin(bot))  # add the cog to the bot
