import discord
from discord.ext import bridge, commands
import wavelink


class Music(commands.Cog):

  def __init__(self, bot):
    self.bot = bot
    self.queue = wavelink.Queue()
    self.currentChannel = None
    
  @commands.Cog.listener()
  async def on_wavelink_track_end(self, player: wavelink.Player, track:   wavelink.Track, reason):
    if not self.queue.is_empty:
      player.play(self.queue.pop())
  @commands.Cog.listener()
  async def on_wavelink_track_start(self, player: wavelink.Player, track:   wavelink.Track):
      embed=discord.Embed(
        colour=discord.Color.green(), 
        title="Now Playing:", 
        description=f"[{player.source.title}]({player.source.info['uri']})")
      embed.set_thumbnail(url=player.track.thumbnail)
      await self.currentChannel.send(embed=embed)
    
  @bridge.bridge_command(name="play")
  async def play(self, ctx, *, search):
    self.currentChannel=ctx.channel
    vc = ctx.voice_client 
    if not vc:  #join author vc
      vc = await ctx.author.voice.channel.connect(cls=wavelink.Player)
    if ctx.author.voice.channel.id != vc.channel.id:
      return await ctx.respond("You must be in the same voice channel as the bot.")
    song = await wavelink.YouTubeTrack.search(query=search, return_first=True)
    if not song:  # check if the song is not found
      return await ctx.respond("No song found.")  # return an error message

    if not self.queue.is_empty:
      self.queue.put(song)  # put the song in the queue
      await ctx.respond(f"Track queued at position {self.queue.count}: `{self.queue.get().info['title']}`") 
    else:
      if vc.is_playing():
        self.queue.put(song)  # put the song in the queue
        await ctx.respond(f"Track queued at position {self.queue.count}: `{self.queue.get().info['title']}`") 
      else:
        await vc.play(song)
      

      
  @bridge.bridge_command(name="skip")
  async def skip(self, ctx):
    vc = ctx.voice_client  #vc = voice client
    if vc == None:
      return await ctx.respond("I am not in a voice channel")

    if ctx.author.voice.channel.id != vc.channel.id:
      return await ctx.respond(
        "You must be in the same voice channel as the bot.")

    if not vc.is_playing():
      return await ctx.respond("Not playing anything currently.")

    await vc.stop()
    await ctx.respond("Stopped playing the current track.")

  

      
def setup(bot):  # this is called by Pycord to setup the cog
  bot.add_cog(Music(bot))  # add the cog to the bot
