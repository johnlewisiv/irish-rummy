import test from 'node:test';
import assert from 'node:assert/strict';
import { createPracticeGame } from './practice.js';

test('practice explicitly creates an isolated table before adding bots and starting', async () => {
  const calls = [];
  const result = await createPracticeGame({
    isCurrent: (code) => !code || code === 'TABLE',
    call: async (event, payload) => { calls.push([event, payload]); return event === 'rooms:create' ? { ok: true, code: 'TABLE' } : { ok: true }; },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ['rooms:create', { roomName: 'Practice table', practice: true }],
    ['room:addBot', { difficulty: 'easy' }], ['room:addBot', { difficulty: 'medium' }],
    ['room:addBot', { difficulty: 'hard' }], ['room:start', undefined],
  ]);
});

test('an account or navigation change stops setup before it can change the next table', async () => {
  for (const stopAfter of [0, 1, 2, 3]) {
    let calls = 0;
    const result = await createPracticeGame({
      isCurrent: () => calls <= stopAfter,
      call: async () => { calls += 1; return { ok: true, code: 'TABLE' }; },
    });
    assert.equal(result.cancelled, true);
    assert.equal(calls, stopAfter + 1);
  }
});

test('already cancelled practice does not create a room', async () => {
  const result = await createPracticeGame({ isCurrent: () => false, call: () => assert.fail('must not send') });
  assert.equal(result.cancelled, true);
});

test('failed or uncertain saves stop practice without replaying a step', async () => {
  for (const uncertain of [false, true]) {
    const calls = [];
    await assert.rejects(createPracticeGame({
      isCurrent: () => true,
      call: async (event) => {
        calls.push(event);
        if (calls.length === 2) throw Object.assign(new Error('No confirmation'), { uncertain });
        return { ok: true, code: 'TABLE' };
      },
    }), /No confirmation/);
    assert.deepEqual(calls, ['rooms:create', 'room:addBot']);
  }
});
