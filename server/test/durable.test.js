import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableRooms, SavingUnavailable } from '../src/durable-rooms.js';
import { JsonStateStore } from '../src/persistence.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
class TestStore {
  kind = 'test'; enabled = true; value = null; fail = false; hold = null;
  async load() { return copy(this.value); }
  async save(value) {
    if (this.hold) await this.hold;
    if (this.fail) throw new Error('Synthetic storage outage');
    this.value = copy(value); return true;
  }
}
const store = new TestStore();
let broadcasts = 0;
const durable = new DurableRooms(store, { onCommit: () => broadcasts++ });
await durable.initialize();
let code;
await durable.run(() => {
  const room = durable.rooms.createRoom('Family Friday', { token: 'alice-secret', name: 'Alice' });
  durable.rooms.joinSeat(room, { token: 'bob-secret', name: 'Bob' });
  room.buyWindowMs = 0;
  durable.rooms.startGame(room, () => {}, durable.gameOptions(room));
  code = room.code;
});
const before = copy(store.value);
assert.equal(broadcasts, 1);

// No acknowledgement/broadcast or second mutation before durable commit.
let release;
store.hold = new Promise((resolve) => { release = resolve; });
let firstDone = false;
const first = durable.run(() => { durable.rooms.get(code).name = 'Saved first'; }).then(() => { firstDone = true; });
let secondRan = false;
const second = durable.run(() => { secondRan = true; durable.rooms.get(code).name = 'Saved second'; });
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(firstDone, false); assert.equal(secondRan, false); assert.equal(broadcasts, 1);
release(); store.hold = null; await Promise.all([first, second]);
assert.equal(store.value.rooms[0].name, 'Saved second');
assert.equal(broadcasts, 3);

// A partially-mutating rejected engine action is rolled back too.
await assert.rejects(durable.run(() => {
  durable.rooms.get(code).name = 'Uncommitted'; throw new Error('Invalid action');
}), /Invalid action/);
assert.equal(durable.rooms.get(code).name, 'Saved second');
assert.equal(broadcasts, 3);

// Save outage pauses, rolls back, and exposes no new state.
store.fail = true;
let effectRan = false;
await assert.rejects(durable.run(() => {
  durable.rooms.get(code).name = 'Must never show';
  durable.afterCommit(() => { effectRan = true; });
}), SavingUnavailable);
assert.equal(durable.paused, true); assert.equal(effectRan, false);
assert.equal(durable.rooms.get(code).name, 'Saved second');
assert.equal(broadcasts, 3);
assert.equal(durable.rooms.get(code).game._runtimeSuspended, true);
await assert.rejects(durable.run(() => {}), SavingUnavailable);
store.fail = false;
assert.equal(await durable.recover(), true);
assert.equal(durable.paused, false);
assert.equal(durable.rooms.get(code).name, 'Saved second');

// A network error can occur after the DB committed. Reload rather than replay.
const originalSave = store.save.bind(store);
store.save = async (value) => { await originalSave(value); throw new Error('Response lost after commit'); };
await assert.rejects(durable.run(() => { durable.rooms.get(code).name = 'Actually committed'; }), SavingUnavailable);
store.save = originalSave;
await durable.recover();
assert.equal(durable.rooms.get(code).name, 'Actually committed');

// A new server rehydrates exact hands, public IDs, seats, scores and room code.
await durable.close();
const restarted = new DurableRooms(store);
await restarted.initialize();
const restored = restarted.rooms.get(code);
assert.deepEqual(restored.game.players.map((p) => p.hand), before.rooms[0].game.players.map((p) => p.hand));
assert.deepEqual(restored.seats, before.rooms[0].seats);
assert.deepEqual(restored.game.players.map((p) => p.score), before.rooms[0].game.players.map((p) => p.score));
assert.equal(restored.game._runtimeSuspended, true, 'nobody online: family table waits');
assert.equal(restored.game.buyWindow.timer, null);
restored.createdAt = 1; restored.updatedAt = 1;
assert.equal(restarted.rooms.sweep(), false, 'old family table survives until host closes it');
await restarted.close();

// Timer callbacks wait behind a pending save, just like player actions.
const timerStore = new TestStore();
const timed = new DurableRooms(timerStore);
await timed.initialize();
let timedCode;
await timed.run(() => {
  const room = timed.rooms.createRoom('Timer table', { token: 'timer-a', name: 'A' });
  timed.rooms.joinSeat(room, { token: 'timer-b', name: 'B' });
  room.buyWindowMs = 30;
  timed.rooms.startGame(room, () => {}, timed.gameOptions(room));
  room.game.draw(room.game.currentPlayer().id, 'deck');
  timedCode = room.code;
});
const initialCount = timed.rooms.get(timedCode).game.currentPlayer().hand.length;
let releaseTimerSave;
timerStore.hold = new Promise((resolve) => { releaseTimerSave = resolve; });
const heldSave = timed.run(() => { timed.rooms.get(timedCode).name = 'Timer save'; });
await new Promise((resolve) => setTimeout(resolve, 70));
assert.equal(timed.rooms.get(timedCode).game.currentPlayer().hand.length, initialCount, 'timer cannot mutate during pending save');
releaseTimerSave(); timerStore.hold = null;
await heldSave;
await timed.tail;
assert.equal(timed.rooms.get(timedCode).game.currentPlayer().hand.length, initialCount + 1, 'queued timer executes after commit');
assert.equal(timerStore.value.rooms[0].game.turnPhase, 'action', 'timer result also persisted');
await timed.close();

// Corrupt files and corrupt schema are fatal, never interpreted as zero rooms.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rummy-durable-test-'));
try {
  const file = path.join(dir, 'rooms.json');
  fs.writeFileSync(file, '{broken');
  const invalid = new DurableRooms(new JsonStateStore(file));
  await assert.rejects(invalid.initialize(), SyntaxError);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  const malformed = new TestStore(); malformed.value = { version: 99, rooms: [] };
  await assert.rejects(new DurableRooms(malformed).initialize(), /unsupported/);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log('durable.test.js: serialized commits, rollback, outage recovery, restart and corruption checks passed');
