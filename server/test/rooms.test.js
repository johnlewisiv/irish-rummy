// rooms.test.js — lobby metadata for host controls and rejoining started games.
import assert from 'assert';
import { RoomManager } from '../src/rooms.js';

const rooms = new RoomManager();
const room = rooms.createRoom('Family table', { token: 'host-token', name: 'Host' });
rooms.addBot(room, 'easy');
rooms.startGame(room, () => {});

const hostView = rooms.list('host-token').find((r) => r.code === room.code);
assert.ok(hostView.started, 'started rooms appear in the lobby list');
assert.ok(hostView.canClose, 'host can close their room from the lobby');
assert.ok(hostView.canRejoin, 'seated host can rejoin their started room');

const guestView = rooms.list('guest-token').find((r) => r.code === room.code);
assert.ok(!guestView.canClose, 'non-host cannot close someone else’s room');
assert.ok(!guestView.canRejoin, 'non-seated user cannot rejoin as a player');

rooms.destroyRoom(room.code);
assert.strictEqual(rooms.get(room.code), undefined, 'destroyRoom removes the room');

console.log('rooms.test.js: all assertions passed ✔');
