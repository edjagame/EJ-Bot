import {
	COMMAND_PREFIX,
	type Command,
} from '../../command.js';

function commandUsage(command: Command): string {
	return `${COMMAND_PREFIX}${command.usage}`;
}

const command: Command = {
	name: 'help',
	description: 'Lists commands or shows help for one command.',
	usage: 'help [command]',
	async execute(message, args, { commands }): Promise<void> {
		const requestedName = args[0]?.toLowerCase();

		if (requestedName) {
			const requested = commands.get(requestedName);

			if (!requested) {
				await message.reply({
					content: `Unknown command \`${requestedName}\`. Use \`${COMMAND_PREFIX}help\` to see available commands.`,
					allowedMentions: { repliedUser: false },
				});
				return;
			}

			const scope = requested.guildOnly ? '\nServer only.' : '';
			await message.reply({
				content: `**${commandUsage(requested)}**\n${requested.description}${scope}`,
				allowedMentions: { repliedUser: false },
			});
			return;
		}

		const commandLines = [...commands.values()]
			.sort((left, right) => left.name.localeCompare(right.name))
			.map(
				(available) =>
					`\`${commandUsage(available)}\` — ${available.description}`,
			);

		await message.reply({
			content: [
				'**Available commands**',
				...commandLines,
				`Use \`${COMMAND_PREFIX}help <command>\` for command details.`,
			].join('\n'),
			allowedMentions: { repliedUser: false },
		});
	},
};

export default command;
