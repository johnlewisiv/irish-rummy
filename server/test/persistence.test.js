// persistence.test.js — disk snapshot save/restore for long-running rooms.
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RoomManager } from '../src/rooms.js';
import { JsonStateStore } from '../src/persistence.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'irish-rummy-state-'));
const stateFile = path.join(dir, 'rooms.json');

try {
  const rooms = new RoomManager();
  const room = rooms.createRoom('Weekend table', { token: 'alice-token', name: 'Alice' });
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

  const hostView = restoredRooms.list('alice-token').find((r) => r.code === room.code);
  assert.ok(hostView.canRejoin, 'restored started room can be rejoined by a seated player');
  assert.ok(hostView.canClose, 'restored host can close the room');

  const freshRoom = restoredRooms.createRoom('Fresh room', { token: 'fresh-host', name: 'Fresh' });
  restoredRooms.addBot(freshRoom, 'easy');
  const freshBot = freshRoom.seats.find((s) => s.isBot);
  assert.ok(!usedBotTokens.has(freshBot.token), 'new bot token does not collide with restored bot tokens');

  restored.game.onChange();
  assert.strictEqual(changedRoom.code, restored.code, 'restored game uses the new room change callback');
  console.log('persistence.test.js: all assertions passed ✔');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
