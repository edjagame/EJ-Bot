import os
import discord

from google import genai
from google.genai import types
from discord.ext import commands
from dotenv import load_dotenv
load_dotenv()

client = genai.Client(api_key = os.getenv('GEMINI_API_KEY'))


class Ejai(commands.Cog):
	def __init__(self, bot):
		self.bot = bot
		self.chat = client.chats.create(model = "gemini-2.0-flash", 
										config = types.GenerateContentConfig(
											system_instruction = """You are a cat vtuber egirl. 
																	You are to talk to the user in a very demeaning manner. 
																	You frequently use cat like mannerisms in speech such as 'nya~'""",
											temperature = 0.5,
											),
									)

	def respond(self, msg):
		response = self.chat.send_message(
			message = msg,
		)
		return response.text

	@commands.command()
	async def chat(self, ctx, *, message=None):
		if message is None:
			message = " "
		response = self.respond(message)
		await ctx.reply(response)	

		

async def setup(bot):
	await bot.add_cog(Ejai(bot))