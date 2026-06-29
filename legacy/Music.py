import wavelink
from discord.ext import commands

class Music(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self._last_member = None
        self.node = None  # Store the node here
        self.bot.loop.create_task(self.connect_to_node())  # Call connect_to_node

    async def connect_to_node(self):  # Separate connection function
        if self.node is None: # Check if a node is already connected
            try:
                self.node = wavelink.Node(uri="http://127.0.0.1:2333", password="youshallnotpass12345678")
                await wavelink.Pool.connect(client=self.bot, nodes=[self.node])
                print("Successfully connected to Lavalink node.") 
                wavelink.Player.autoplay = True
            except Exception as e:
                print(f"Error connecting to Lavalink node: {e}")  
    

    @commands.command(name="play", help="Play music in the voice channel. Usage: !play <song name> or !play <URL>")
    async def play(self, ctx, *, search: str):
        """Play music in the voice channel. Usage: !play <song name>"""
        query = await wavelink.Playable.search(search)
        query = query[0]
        
        if not ctx.voice_client:
            vc: wavelink.Player = await ctx.author.voice.channel.connect(cls=wavelink.Player)
        else:
            vc: wavelink.Player = ctx.voice_client

        if vc.queue.is_empty:
            await vc.play(query)
            await ctx.send(f'Now playing: {query.title}')
        else:
            await vc.queue.put_wait(query)
            await ctx.send(f'Added to queue: {query.title}')

    @commands.command(name="skip", help="Skip the current song. Usage: !skip")
    async def skip(self, ctx):
        vc: wavelink.Player = ctx.voice_client
        await vc.stop()
        await ctx.send('Skipped!')

    @commands.command(name="pause", help="Pause the current song. Usage: !pause")
    async def pause(self, ctx):
        vc: wavelink.Player = ctx.voice_client
        await vc.set_pause(True)
        await ctx.send('Paused!')
    
    @commands.command(name="resume", help="Resume the current song. Usage: !resume")
    async def resume(self, ctx):
        vc: wavelink.Player = ctx.voice_client
        await vc.set_pause(False)
        await ctx.send('Resumed!')

    @commands.command(name="disconnect", help="Disconnect the bot from the voice channel. Usage: !disconnect")
    async def disconnect(self, ctx):
        vc: wavelink.Player = ctx.voice_client
        await vc.disconnect()
        await ctx.send('Disconnected!')
    
    @commands.command(name="queue", help="Display the current queue. Usage: !queue")
    async def queue(self, ctx):
        vc: wavelink.Player = ctx.voice_client
        if vc.queue.is_empty:
            await ctx.send('Queue is empty!')
        else:
            queue = vc.queue
            await ctx.send(f'Queue: {queue}')
        
async def setup(bot):  
    await bot.add_cog(Music(bot))