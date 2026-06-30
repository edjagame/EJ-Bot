import { randomInt } from 'node:crypto';
import { COMMAND_PREFIX, type Command } from '../../command.js';

export const MAX_DICE = 100;
export const MAX_SIDES = 1_000_000;

interface DiceNotation {
	count: number;
	sides: number;
}

type RandomInteger = (minimum: number, maximum: number) => number;

export function parseDiceNotation(notation: string): DiceNotation | null {
	const match = /^(\d+)d(\d+)$/iu.exec(notation);

	if (!match) {
		return null;
	}

	return {
		count: Number(match[1]),
		sides: Number(match[2]),
	};
}

export function rollDice(
	count: number,
	sides: number,
	randomInteger: RandomInteger = randomInt,
): number[] {
	return Array.from({ length: count }, () =>
		randomInteger(1, sides + 1),
	);
}

const command: Command = {
	name: 'roll',
	description: `Rolls up to ${MAX_DICE} dice using standard dice notation.`,
	usage: 'roll <count>d<sides>',
	async execute(message, args): Promise<void> {
		const notation = args.length === 1
			? parseDiceNotation(args[0]!)
			: null;

		if (!notation) {
			await message.reply(
				`Usage: \`${COMMAND_PREFIX}roll <count>d<sides>\` (example: \`${COMMAND_PREFIX}roll 2d20\`).`,
			);
			return;
		}

		if (notation.count < 1 || notation.count > MAX_DICE) {
			await message.reply(
				`Roll between 1 and ${MAX_DICE} dice at a time.`,
			);
			return;
		}

		if (notation.sides < 2 || notation.sides > MAX_SIDES) {
			await message.reply(
				`Each die must have between 2 and ${MAX_SIDES.toLocaleString('en-US')} sides.`,
			);
			return;
		}

		const rolls = rollDice(notation.count, notation.sides);
		const total = rolls.reduce((sum, roll) => sum + roll, 0);

		await message.reply(
			`🎲 \`${notation.count}d${notation.sides}\`: ${rolls.join(', ')}\n**Total: ${total}**`,
		);
	},
};

export default command;
