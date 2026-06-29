import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCommands } from '../src/load-commands.js';

const MUSIC_COMMANDS = [
	'disconnect',
	'pause',
	'play',
	'queue',
	'resume',
	'skip',
] as const;

test('marks every registered music command with the music feature', async () => {
	const commands = await loadCommands();

	assert.deepEqual(
		[...commands.values()]
			.filter((command) => command.feature === 'music')
			.map((command) => command.name)
			.sort(),
		MUSIC_COMMANDS,
	);
});
