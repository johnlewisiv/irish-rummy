// persistence.test.js — disk snapshot save/restore for long-running rooms.
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RoomManager } from '../src/rooms.js';
import { JsonStateStore } from '../src/persistence.js';
import { importPreservedState } from '../src/state-import.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'irish-rummy-state-'));
const stateFile = path.join(dir, 'rooms.json');

try {
  const rooms = new RoomManager();
  const room = rooms.createRoom('Weekend table', { token: 'alice-token', accountId: 'alice-account', name: 'Alice' });
  rooms.joinSeat(room, { token: 'bob-token', name: 'Bob' });
  rooms.joinSeat(room, { token: 'cara-token', name: 'Cara' });
  room.buyWindowMs = 0;
  room.chat.push({ from: 'Alice', role: 'player', text: 'pause here', at: Date.now() });
  rooms.startGame(room, () => {});

  const current = room.game.currentPlayer();
  const passer = room.game.players.find((p) => p.id !== current.id);
  room.game.passBuy(passer.id);
  const handCounts = Object.fromEntries(room.game.players.map((p) => [p.id, p.hand.length]));

  const botRoom = rooms.createRoom('Bot parking lot', { token: 'host-token', name: 'Host' });
  rooms.addBot(botRoom, 'easy');
  const usedBotTokens = new Set(botRoom.seats.filter((s) => s.isBot).map((s) => s.token));

  const store = new JsonStateStore(stateFile);
  assert.ok(store.save(rooms.toSnapshot()), 'snapshot saved');
  const loaded = store.load();
  assert.strictEqual(loaded.rooms.length, 2, 'both rooms written');

  const restoredRooms = new RoomManager();
  let changedRoom = null;
  assert.strictEqual(restoredRooms.loadSnapshot(loaded, (r) => { changedRoom = r; }), 2, 'rooms restored');

  const restored = restoredRooms.get(room.code);
  assert.ok(restored, 'main room restored by code');
  assert.ok(restored.game, 'started game restored');
  assert.strictEqual(restored.chat[0].text, 'pause here', 'chat restored');
  assert.ok(restored.game.buyPasses instanceof Set, 'buy passes restored as Set');
  assert.ok(restored.game.buyPasses.has(passer.id), 'buy pass restored');
  assert.ok(restored.game.buyWindow, 'untimed buy window restored');
  assert.strictEqual(restored.game.buyWindow.timer, null, 'untimed buy window has no timer');
  assert.deepStrictEqual(
    Object.fromEntries(restored.game.players.map((p) => [p.id, p.hand.length])),
    handCounts,
    'hands restored with the same card counts',
  );
  assert.ok(restored.game.players.filter((p) => !p.isBot).every((p) => !p.connected), 'humans restore as disconnected until they rejoin');
  restored.game.assertDeckIntegrity();

  const hostView = restoredRooms.list('alice-token', 'alice-account').find((r) => r.code === room.code);
  assert.ok(hostView.canRejoin, 'restored started room can be rejoined by a seated player');
  assert.ok(hostView.canClose, 'restored host can close the room');

  const freshRoom = restoredRooms.createRoom('Fresh room', { token: 'fresh-host', name: 'Fresh' });
  restoredRooms.addBot(freshRoom, 'easy');
  const freshBot = freshRoom.seats.find((s) => s.isBot);
  assert.ok(!usedBotTokens.has(freshBot.token), 'new bot token does not collide with restored bot tokens');

  restored.game.onChange();
  assert.strictEqual(changedRoom.code, restored.code, 'restored game uses the new room change callback');
  // Exercise the actual file importer with a synthetic store. JSONB may reorder
  // object keys, but any changed hand, decision, or chat must fail verification
  // even when the destination still contains exactly the expected room count.
  const jsonCopy = (value) => JSON.parse(JSON.stringify(value));
  const reorderObjectKeys = (value) => Array.isArray(value) ? value.map(reorderObjectKeys)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorderObjectKeys(item)])) : value;
  class ImportStore {
    constructor({ existing = null, change = null } = {}) { this.value = existing; this.change = change; this.saves = 0; }
    async load() { return jsonCopy(this.value); }
    async save(value) { this.saves++; this.value = reorderObjectKeys(jsonCopy(value)); this.change?.(this.value); return true; }
  }
  const sourceBytes = fs.readFileSync(stateFile);
  const happyStore = new ImportStore();
  const imported = await importPreservedState(stateFile, happyStore);
  assert.strictEqual(imported.roomCount, loaded.rooms.length, 'all source rooms imported');
  assert.strictEqual(happyStore.saves, 1, 'successful import writes once');
  assert.strictEqual(happyStore.value.version, 3, 'import emits the current snapshot version');
  assert.deepStrictEqual(happyStore.value.rooms[0].game.players.map((p) => p.hand), loaded.rooms[0].game.players.map((p) => p.hand), 'happy path retains exact hands');
  assert.deepStrictEqual(fs.readFileSync(stateFile), sourceBytes, 'successful import preserves the source bytes');

  for (const [label, change] of [
    ['hand', (value) => { value.rooms[0].game.players[0].hand[0].rank = 'altered-test-rank'; }],
    ['decision', (value) => { value.rooms[0].game.buyPasses = []; }],
    ['chat', (value) => { value.rooms[0].chat[0].text = 'altered private test message'; }],
  ]) {
    const mismatch = new ImportStore({ change });
    await assert.rejects(importPreservedState(stateFile, mismatch), (error) => error.code === 'IMPORT_VERIFY_MISMATCH'
      && !error.message.includes('altered private test message'), `${label} mismatch must fail without printing private contents`);
    assert.strictEqual(mismatch.value.rooms.length, loaded.rooms.length, 'room count alone would miss this corruption');
    assert.strictEqual(mismatch.saves, 1, 'mismatch is reported without overwriting or retrying');
    assert.deepStrictEqual(fs.readFileSync(stateFile), sourceBytes, `${label} mismatch leaves the source intact`);
  }

  const emptyDestination = { version: 3, accounts: [], rooms: [] };
  const occupiedStore = new ImportStore({ existing: emptyDestination });
  await assert.rejects(importPreservedState(stateFile, occupiedStore), /Destination already has state/);
  assert.strictEqual(occupiedStore.saves, 0, 'even an existing empty room set is never overwritten');
  assert.deepStrictEqual(occupiedStore.value, emptyDestination, 'existing destination is unchanged');
  assert.deepStrictEqual(fs.readFileSync(stateFile), sourceBytes, 'refused import leaves the source intact');
  const invalidSource = path.join(dir, 'invalid-import.json');
  const invalidBytes = '{"private-seat-proof":hidden-synthetic-proof}';
  fs.writeFileSync(invalidSource, invalidBytes, { mode: 0o600 });
  const untouchedStore = new ImportStore();
  await assert.rejects(importPreservedState(invalidSource, untouchedStore), (error) => error.code === 'IMPORT_SOURCE_INVALID'
    && !error.message.includes('hidden-synthetic-proof'), 'invalid source errors do not disclose its private contents');
  assert.strictEqual(untouchedStore.saves, 0, 'invalid source never reaches a destination write');
  assert.strictEqual(fs.readFileSync(invalidSource, 'utf8'), invalidBytes, 'unreadable source is preserved');
  console.log('full-snapshot import verification rejects changed hands, decisions and chat with unchanged room counts');
  console.log('persistence.test.js: all assertions passed ✔');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
