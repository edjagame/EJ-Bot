import {
	COMMAND_PREFIX,
	isCommandEnabled,
	type Command,
} from '../../command.js';

function commandUsage(command: Command): string {
	return `${COMMAND_PREFIX}${command.usage}`;
}

const command: Command = {
	name: 'help',
	description: 'Lists commands or shows help for one command.',
	usage: 'help [command]',
	async execute(message, args, context): Promise<void> {
		const { commands } = context;
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
			const availability = isCommandEnabled(requested, context)
				? ''
				: '\nTemporarily disabled.';
			await message.reply({
				content: `**${commandUsage(requested)}**\n${requested.description}${scope}${availability}`,
				allowedMentions: { repliedUser: false },
			});
			return;
		}

		const commandLines = [...commands.values()]
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((available) => {
				const availability = isCommandEnabled(available, context)
					? ''
					: ' (temporarily disabled)';

				return `\`${commandUsage(available)}\` — ${available.description}${availability}`;
			});

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
