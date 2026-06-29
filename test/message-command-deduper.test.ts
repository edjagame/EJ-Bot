import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageCommandDeduper } from '../src/message-command-deduper.js';

test('claims each message id once until its dedupe window expires', async () => {
	const deduper = new MessageCommandDeduper(25);

	assert.equal(deduper.claim('message-1'), true);
	assert.equal(deduper.claim('message-1'), false);

	await new Promise((resolve) => setTimeout(resolve, 40));

	assert.equal(deduper.claim('message-1'), true);
});
