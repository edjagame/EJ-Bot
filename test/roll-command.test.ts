import assert from 'node:assert/strict';
import test from 'node:test';
import rollCommand, {
	MAX_DICE,
	MAX_SIDES,
	parseDiceNotation,
	rollDice,
} from '../src/commands/utility/roll.js';

function fakeMessage() {
	const replies: string[] = [];

	return {
		value: {
			reply: async (response: string | { content: string }) => {
				replies.push(
					typeof response === 'string' ? response : response.content,
				);
			},
		},
		replies,
	};
}

test('parses standard dice notation case-insensitively', () => {
	assert.deepEqual(parseDiceNotation('2d20'), { count: 2, sides: 20 });
	assert.deepEqual(parseDiceNotation('3D6'), { count: 3, sides: 6 });
	assert.equal(parseDiceNotation('d20'), null);
	assert.equal(parseDiceNotation('2d20extra'), null);
	assert.equal(parseDiceNotation('2 d20'), null);
});

test('rolls the requested dice using inclusive bounds', () => {
	const calls: Array<[number, number]> = [];
	const values = [1, 20];
	const rolls = rollDice(2, 20, (minimum, maximum) => {
		calls.push([minimum, maximum]);
		return values[calls.length - 1]!;
	});

	assert.deepEqual(rolls, [1, 20]);
	assert.deepEqual(calls, [
		[1, 21],
		[1, 21],
	]);
});

test('roll command reports each result and their total', async () => {
	const target = fakeMessage();

	await rollCommand.execute(
		target.value as never,
		['2d20'],
		{} as never,
	);

	assert.equal(target.replies.length, 1);
	assert.match(
		target.replies[0]!,
		/^🎲 `2d20`: \d+, \d+\n\*\*Total: \d+\*\*$/u,
	);

	const values = [...target.replies[0]!.matchAll(/\d+/gu)].map(
		(match) => Number(match[0]),
	);
	const [, , firstRoll, secondRoll, total] = values;

	assert.ok(firstRoll! >= 1 && firstRoll! <= 20);
	assert.ok(secondRoll! >= 1 && secondRoll! <= 20);
	assert.equal(total, firstRoll! + secondRoll!);
});

test('roll command rejects malformed and excessive rolls', async () => {
	const malformed = fakeMessage();
	const tooMany = fakeMessage();
	const tooManySides = fakeMessage();

	await rollCommand.execute(
		malformed.value as never,
		['not-dice'],
		{} as never,
	);
	await rollCommand.execute(
		tooMany.value as never,
		[`${MAX_DICE + 1}d20`],
		{} as never,
	);
	await rollCommand.execute(
		tooManySides.value as never,
		[`1d${MAX_SIDES + 1}`],
		{} as never,
	);

	assert.deepEqual(malformed.replies, [
		'Usage: `e!roll <count>d<sides>` (example: `e!roll 2d20`).',
	]);
	assert.deepEqual(tooMany.replies, [
		`Roll between 1 and ${MAX_DICE} dice at a time.`,
	]);
	assert.deepEqual(tooManySides.replies, [
		'Each die must have between 2 and 1,000,000 sides.',
	]);
});
