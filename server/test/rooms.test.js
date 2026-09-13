// rooms.test.js — lobby metadata for host controls and rejoining started games.
import assert from 'assert';
import { RoomManager } from '../src/rooms.js';

const rooms = new RoomManager();
const room = rooms.createRoom('Family table', { token: 'host-token', accountId: 'host-account', name: 'Host' });
rooms.addBot(room, 'easy');
rooms.startGame(room, () => {});

const hostView = rooms.list('host-token', 'host-account').find((r) => r.code === room.code);
assert.ok(hostView.started, 'started rooms appear in the lobby list');
assert.ok(hostView.canClose, 'host can close their room from the lobby');
assert.ok(hostView.canRejoin, 'seated host can rejoin their started room');

assert.deepEqual(rooms.list('guest-token', 'guest-account'), [], 'other accounts cannot discover private games');

rooms.destroyRoom(room.code);
assert.strictEqual(rooms.get(room.code), undefined, 'destroyRoom removes the room');

console.log('rooms.test.js: all assertions passed ✔');
