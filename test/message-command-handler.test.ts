import assert from 'node:assert/strict';
import test from 'node:test';
import type {
	Command,
	CommandContext,
} from '../src/command.js';
import helpCommand from '../src/commands/utility/help.js';
import { handleMessageCommand } from '../src/message-command-handler.js';
import { AudioServiceUnavailableError } from '../src/music/music-service.js';

function fakeMessage(content: string, bot = false) {
	const replies: string[] = [];

	return {
		value: {
			content,
			author: { bot },
			guildId: 'guild-1',
			reply: async (response: string | { content: string }) => {
				replies.push(
					typeof response === 'string' ? response : response.content,
				);
			},
		},
		replies,
	};
}

function context(
	commands: ReadonlyMap<string, Command>,
	musicEnabled = true,
): CommandContext {
	return {
		music: musicEnabled ? ({} as never) : null,
		commands,
		enabledFeatures: new Set(musicEnabled ? ['music'] as const : []),
	};
}

function testCommand(
	name: string,
	execute: Command['execute'] = async () => {},
): Command {
	return {
		name,
		description: `Description for ${name}.`,
		usage: name,
		execute,
	};
}

test('ignores bot messages and messages without the prefix', async () => {
	let executions = 0;
	const command = testCommand('ping', async () => {
		executions += 1;
	});
	const commands = new Map([['ping', command]]);

	await handleMessageCommand(
		fakeMessage('e!ping', true).value as never,
		context(commands),
	);
	await handleMessageCommand(
		fakeMessage('ping').value as never,
		context(commands),
	);

	assert.equal(executions, 0);
});

test('dispatches case-insensitive command names with parsed arguments', async () => {
	let receivedArgs: readonly string[] = [];
	const command = testCommand('play', async (_message, args) => {
		receivedArgs = args;
	});
	const commands = new Map([['play', command]]);
	const target = fakeMessage('e!PlAy   first second');

	await handleMessageCommand(target.value as never, context(commands));

	assert.deepEqual(receivedArgs, ['first', 'second']);
	assert.deepEqual(target.replies, []);
});

test('uses help for an empty prefix and reports unknown commands', async () => {
	let helpExecutions = 0;
	const help = testCommand('help', async () => {
		helpExecutions += 1;
	});
	const commands = new Map([['help', help]]);
	const empty = fakeMessage('e!   ');
	const unknown = fakeMessage('e!missing');

	await handleMessageCommand(empty.value as never, context(commands));
	await handleMessageCommand(unknown.value as never, context(commands));

	assert.equal(helpExecutions, 1);
	assert.deepEqual(unknown.replies, [
		'Unknown command `missing`. Use `e!help` to see available commands.',
	]);
});

test('rejects commands while shutting down', async () => {
	let executions = 0;
	const command = testCommand('ping', async () => {
		executions += 1;
	});
	const commands = new Map([['ping', command]]);
	const target = fakeMessage('e!ping');

	await handleMessageCommand(target.value as never, context(commands), {
		isShuttingDown: true,
	});

	assert.equal(executions, 0);
	assert.deepEqual(target.replies, [
		'The bot is shutting down. Try again after it restarts.',
	]);
});

test('rejects disabled music commands before execution', async () => {
	let executions = 0;
	const command: Command = {
		...testCommand('play', async () => {
			executions += 1;
		}),
		feature: 'music',
	};
	const commands = new Map([['play', command]]);
	const target = fakeMessage('e!play url');

	await handleMessageCommand(
		target.value as never,
		context(commands, false),
	);

	assert.equal(executions, 0);
	assert.deepEqual(target.replies, [
		'Music commands are temporarily disabled.',
	]);
});

test('keeps utility commands available while music is disabled', async () => {
	let executions = 0;
	const command = testCommand('ping', async () => {
		executions += 1;
	});
	const commands = new Map([['ping', command]]);
	const target = fakeMessage('e!ping');

	await handleMessageCommand(
		target.value as never,
		context(commands, false),
	);

	assert.equal(executions, 1);
	assert.deepEqual(target.replies, []);
});

test('maps unavailable audio services to a user-facing response', async () => {
	const command: Command = {
		...testCommand('play', async () => {
			throw new AudioServiceUnavailableError();
		}),
		feature: 'music',
	};
	const commands = new Map([['play', command]]);
	const target = fakeMessage('e!play url');
	const originalWarn = console.warn;
	console.warn = () => {};

	try {
		await handleMessageCommand(target.value as never, context(commands));
	} finally {
		console.warn = originalWarn;
	}

	assert.deepEqual(target.replies, [
		'The audio service is unavailable. Try again later.',
	]);
});

test('help lists commands and shows details for a selected command', async () => {
	const play: Command = {
		...testCommand('play'),
		description: 'Plays a YouTube URL.',
		usage: 'play <YouTube URL>',
		guildOnly: true,
		feature: 'music',
	};
	const commands = new Map<string, Command>([
		['play', play],
		['help', helpCommand],
	]);
	const listing = fakeMessage('e!help');
	const details = fakeMessage('e!help play');
	const disabledListing = fakeMessage('e!help');
	const disabledDetails = fakeMessage('e!help play');

	await helpCommand.execute(
		listing.value as never,
		[],
		context(commands),
	);
	await helpCommand.execute(
		details.value as never,
		['play'],
		context(commands),
	);
	await helpCommand.execute(
		disabledListing.value as never,
		[],
		context(commands, false),
	);
	await helpCommand.execute(
		disabledDetails.value as never,
		['play'],
		context(commands, false),
	);

	assert.match(listing.replies[0]!, /\*\*Available commands\*\*/);
	assert.match(listing.replies[0]!, /`e!help \[command\]`/);
	assert.match(listing.replies[0]!, /`e!play <YouTube URL>`/);
	assert.deepEqual(details.replies, [
		'**e!play <YouTube URL>**\nPlays a YouTube URL.\nServer only.',
	]);
	assert.match(
		disabledListing.replies[0]!,
		/`e!play <YouTube URL>`.*\(temporarily disabled\)/,
	);
	assert.deepEqual(disabledDetails.replies, [
		'**e!play <YouTube URL>**\nPlays a YouTube URL.\nServer only.\nTemporarily disabled.',
	]);
});
