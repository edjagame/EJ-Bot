import os
import discord

from google import genai
from google.genai import types
from discord.ext import commands
from dotenv import load_dotenv
load_dotenv()

class Ejai(commands.Cog):
	def __init__(self, bot):
		self.bot = bot
		self.client =genai.Client(api_key = os.getenv('GEMINI_API_KEY'))
		self.chat = self.client.chats.create(model = "gemini-2.0-flash", 
										config = types.GenerateContentConfig(
											system_instruction = """You are a cat vtuber egirl. 
																	You frequently use cat like mannerisms in speech such as 'nya~'
																	Answer within 4000 characters.
																	Images generated should be under 10MB due to Discord limitations.""",
											temperature = 0.5,
											),
									)

	@commands.command()
	async def chat(self, ctx, *, discordMessage=None):
		contents = []

		if discordMessage is None:
			contents.append(" ")
		
		contents.append(discordMessage)

		if ctx.message.attachments:
			for attachment in ctx.message.attachments:
				contents.append(attachment.url)

		async with ctx.typing():
			response = self.chat.send_message(contents)
			await ctx.reply(response.text)	

	# This function is used to chat in other cogs
	def respond(self, message):
		response = self.chat.send_message(message)
		return response.text
	
async def setup(bot):
	await bot.add_cog(Ejai(bot))