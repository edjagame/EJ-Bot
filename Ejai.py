import os
import discord

from google import genai

from discord.ext import commands

from dotenv import load_dotenv
load_dotenv()

client = genai.Client(api_key = os.getenv('GEMINI_API_KEY'))

class Ejai(commands.Cog):
	def __init__(self, bot):
		self.bot = bot

	@commands.command()
	async def chat(self, ctx, *, message):
		"""Chat with Ejai"""
		response = client.models.generate_content(
			model = "gemini-2.0-flash",
			contents = message
		)
		await ctx.reply(response.text)

async def setup(bot):
	await bot.add_cog(Ejai(bot))