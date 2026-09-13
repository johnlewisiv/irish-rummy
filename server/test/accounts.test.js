// Synthetic identities only. Exercises the production verifier and real sockets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { once } from 'node:events';
import { createAuth } from '../src/auth.js';
import { createGameServer } from '../src/index.js';
import { RoomManager, MAX_JOIN_REQUESTS } from '../src/rooms.js';
import { Game } from '../src/game.js';

const testExpiry = Math.floor(Date.now() / 1000) + 3600;
const token = (id, exp = testExpiry) => `synthetic.${Buffer.from(JSON.stringify({ sub: id, exp })).toString('base64url')}.signature`;
const identities = new Map(['alice', 'bob', 'carol'].map((id) => [token(id), {
  id, identities: [{ provider: 'google' }], user_metadata: { full_name: id, avatar_url: `https://lh3.googleusercontent.com/${id}` },
}]));
function authority() {
  return createAuth({ env: { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'synthetic-public' },
    fetcher: async (url, options) => {
      assert.equal(url, 'https://synthetic.supabase.co/auth/v1/user');
      assert.equal(options.headers.apikey, 'synthetic-public');
      const user = identities.get(options.headers.Authorization.replace('Bearer ', ''));
      return { ok: !!user, json: async () => structuredClone(user) };
    } });
}
async function fixture(t, initial = null) {
  let saved = structuredClone(initial);
  const control = { hold: null, fail: false };
  const store = { kind: 'synthetic', enabled: true, load: async () => structuredClone(saved), save: async (s) => {
    if (control.hold) await control.hold;
    if (control.fail) throw new Error('Synthetic save unavailable');
    saved = structuredClone(s); return true;
  }, close: async () => {} };
  let instance;
  const clients = [];
  const wire = [];
  async function start() { instance = await createGameServer({ stateStore: store, auth: authority() }); await instance.listen(0, '127.0.0.1'); }
  async function connect(identity) {
    const socket = io(`http://127.0.0.1:${instance.server.address().port}`, { transports: ['websocket'], reconnection: false, forceNew: true });
    const peer = { socket, state: null };
    clients.push(peer);
    socket.onAny((event, data) => { wire.push({ event, data }); if (event === 'room:state') peer.state = data; });
    await once(socket, 'connect');
    if (identity) await call(peer, 'hello', { accessToken: token(identity), rejoin: false });
    return peer;
  }
  async function ack(peer, event, payload = {}) {
    return new Promise((resolve, reject) => peer.socket.timeout(5000).emit(event, payload, (err, data) => err ? reject(err) : resolve(data)));
  }
  async function call(peer, event, payload = {}) { const result = await ack(peer, event, payload); assert.equal(result.error, undefined, `${event}: ${result.error}`); return result; }
  async function restart() { for (const peer of clients) peer.socket.disconnect(); await instance.close(); await start(); }
  t.after(async () => { for (const peer of clients) peer.socket.disconnect(); await instance.close(); });
  await start();
  return { connect, ack, call, restart, wire, control, saved: () => structuredClone(saved), instance: () => instance };
}

test('verified Google identity, not client UUID/name, controls profiles; invalid and expired tokens fail closed', async () => {
  const auth = authority();
  await assert.rejects(auth.verify(token('forged-user')), /expired/i);
  const expired = token('expired', 1);
  identities.set(expired, { id: 'expired', identities: [{ provider: 'google' }] });
  await assert.rejects(auth.verify(expired), /verified Google/i);
  const password = token('password');
  identities.set(password, { id: 'password', identities: [{ provider: 'email' }] });
  await assert.rejects(auth.verify(password), /Google/i);
  const mismatch = token('claimed-alice');
  identities.set(mismatch, { id: 'bob', identities: [{ provider: 'google' }] });
  await assert.rejects(auth.verify(mismatch), /Google/i);
  assert.equal((await auth.verify(token('alice'))).id, 'alice');
});

test('private membership and rotated invitations prevent discovery, code-only joins, and unauthorized spectators', async (t) => {
  const f = await fixture(t);
  const alice = await f.connect('alice');
  const bob = await f.connect('bob');
  const carol = await f.connect('carol');
  const spoof = await f.call(alice, 'hello', { accessToken: token('alice'), id: 'bob', name: 'Impersonated Bob', rejoin: false });
  assert.equal(spoof.profile.id, 'alice'); assert.equal(spoof.profile.displayName, 'alice');
  const { code } = await f.call(alice, 'rooms:create', { roomName: 'Private family table' });
  assert.equal(f.saved().rooms[0].buyWindowMs, 30000);
  assert.deepEqual((await f.call(bob, 'rooms:list')).rooms, []);
  assert.match((await f.ack(bob, 'rooms:join', { code })).error, /invitation/i);
  assert.match((await f.ack(bob, 'rooms:join', { code, spectate: true })).error, /invitation/i);
  assert.match((await f.ack(bob, 'room:close', { code })).error, /host/i);
  const first = await f.call(alice, 'room:invite');
  assert.ok(first.inviteToken.length >= 40);
  const second = await f.call(alice, 'room:invite', { rotate: true });
  assert.notEqual(first.inviteToken, second.inviteToken);
  assert.match((await f.ack(bob, 'rooms:join', { code, inviteToken: first.inviteToken })).error, /invitation/i);
  await f.call(bob, 'rooms:join', { code, inviteToken: second.inviteToken });
  assert.equal((await f.call(bob, 'rooms:list')).rooms[0].code, code);
  assert.deepEqual((await f.call(carol, 'rooms:list')).rooms, []);
  await f.call(alice, 'room:invite', { rotate: true });
  await f.call(bob, 'rooms:leave');
  await f.call(bob, 'rooms:join', { code }); // Existing members need no invitation again.
  assert.match((await f.ack(bob, 'room:invite')).error, /host/i);
  assert.ok(!JSON.stringify(f.wire).includes(second.inviteToken), 'Invitation is not broadcast to the table');
  assert.ok(!JSON.stringify(f.wire).includes('account:alice'), 'Internal identity does not leave personalized room views');
  assert.ok(!JSON.stringify(f.wire).includes('googleusercontent.com'), 'Google photo is private by default');
  await f.call(alice, 'profile:update', { displayName: 'Alice Lake', avatarId: 'lake-coffee', useGooglePhoto: true });
  assert.equal(alice.state.room.seats.find((seat) => seat.token === alice.state.you).photoUrl, 'https://lh3.googleusercontent.com/alice');
  const binding = f.instance().io.of('/').sockets.get(bob.socket.id).data;
  binding.authExpiresAt = 1;
  assert.equal((await f.ack(bob, 'rooms:list')).code, 'AUTH_EXPIRED');
});

test('game-code requests are private, use verified profiles, and become durable seats only after host approval commits', async (t) => {
  const f = await fixture(t);
  let alice = await f.connect('alice');
  let bob = await f.connect('bob');
  const carol = await f.connect('carol');
  const { code } = await f.call(alice, 'rooms:create');
  await f.call(carol, 'rooms:join', await f.call(alice, 'room:invite'));
  await f.call(bob, 'profile:update', { displayName: 'Bob Lake', avatarId: 'lake-coffee' });
  assert.deepEqual(await f.call(bob, 'rooms:requestJoin', { code: ` ${code.toLowerCase()} `, accountId: 'carol', name: 'Forged' }), { ok: true, pending: true, code });
  await f.call(alice, 'rooms:list');
  await f.call(carol, 'rooms:list');
  const requestId = alice.state.room.joinRequests[0].requestId;
  assert.match(requestId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(alice.state.room.joinRequests, [{ requestId, displayName: 'Bob Lake', avatarId: 'lake-coffee', photoUrl: null }]);
  assert.equal(Object.hasOwn(carol.state.room, 'joinRequests'), false, 'Only the host sees requests');
  assert.equal(bob.state, null, 'A request does not attach the requester to a private room');
  assert.deepEqual((await f.call(bob, 'rooms:list')).rooms, []);
  assert.match((await f.ack(bob, 'rooms:join', { code })).error, /invitation/i);
  assert.match((await f.ack(bob, 'chat:send', { text: 'No access yet' })).error, /not in a room/i);
  assert.deepEqual(await f.call(bob, 'rooms:requestJoin', { code }), { ok: true, pending: true, code });
  assert.equal(f.saved().rooms[0].joinRequests.length, 1, 'Repeated requests are idempotent');
  assert.equal(f.saved().rooms[0].joinRequests[0].accountId, 'bob');
  assert.equal(f.saved().rooms[0].joinRequests[0].requestId, requestId);
  for (const event of ['room:approveJoin', 'room:denyJoin']) assert.match((await f.ack(carol, event, { requestId })).error, /host/i);
  await f.call(bob, 'profile:update', { useGooglePhoto: true });
  await f.call(alice, 'rooms:list');
  assert.equal(alice.state.room.joinRequests[0].photoUrl, 'https://lh3.googleusercontent.com/bob');
  assert.ok(!JSON.stringify(f.wire).includes('account:bob'), 'No internal account token is broadcast');

  await f.restart();
  alice = await f.connect('alice'); bob = await f.connect('bob');
  await f.call(alice, 'rooms:join', { code });
  assert.equal(alice.state.room.joinRequests[0].requestId, requestId, 'Pending requests survive restart');
  assert.deepEqual(await f.call(bob, 'rooms:joinRequestStatus', { code }), { ok: true, code, pending: true });
  assert.deepEqual((await f.call(bob, 'rooms:list')).rooms, []);
  let releaseSave;
  f.control.hold = new Promise((resolve) => { releaseSave = resolve; });
  let acknowledged = false;
  const approval = f.ack(alice, 'room:approveJoin', { requestId }).then((result) => { acknowledged = true; return result; });
  try {
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(acknowledged, false, 'Host approval waits for durable storage');
    assert.equal(f.saved().rooms[0].members.bob, undefined);
    assert.equal(bob.state, null);
  } finally { f.control.hold = null; releaseSave(); }
  assert.deepEqual(await approval, { ok: true, approved: true, code });
  assert.deepEqual(await f.call(bob, 'rooms:joinRequestStatus', { code }), { ok: true, code, member: true });
  assert.equal((await f.call(bob, 'rooms:list')).rooms[0].code, code);
  await f.call(bob, 'rooms:join', { code });
  const seatId = bob.state.you;
  assert.equal(bob.state.role, 'player');
  assert.equal(bob.state.room.seats.find((seat) => seat.token === seatId).name, 'Bob Lake');
  assert.deepEqual(await f.call(bob, 'rooms:requestJoin', { code }), { ok: true, member: true, code });
  assert.deepEqual(f.saved().rooms[0].joinRequests, []);
  await f.restart();
  bob = await f.connect('bob');
  assert.deepEqual(await f.call(bob, 'rooms:joinRequestStatus', { code }), { ok: true, code, member: true });
  await f.call(bob, 'rooms:join', { code });
  assert.equal(bob.state.you, seatId, 'Approved membership and public seat survive another restart');
});

test('denied, started, closed, full and practice tables never admit code-only newcomers', async (t) => {
  const f = await fixture(t);
  let alice = await f.connect('alice');
  let bob = await f.connect('bob');
  const guest = await f.connect();
  await f.call(guest, 'hello', { token: 'synthetic-code-guest-proof' });
  const { code } = await f.call(alice, 'rooms:create');
  assert.equal((await f.ack(guest, 'rooms:requestJoin', { code })).code, 'AUTH_REQUIRED');
  assert.equal((await f.ack(guest, 'rooms:joinRequestStatus', { code })).code, 'AUTH_REQUIRED');
  await f.call(bob, 'rooms:requestJoin', { code });
  const requestId = f.saved().rooms[0].joinRequests[0].requestId;
  await f.call(alice, 'room:denyJoin', { requestId });
  assert.deepEqual(await f.call(bob, 'rooms:joinRequestStatus', { code }), { ok: true, code, pending: false });
  assert.equal(f.saved().rooms[0].members.bob, undefined);
  await f.restart();
  alice = await f.connect('alice'); bob = await f.connect('bob');
  await f.call(alice, 'rooms:join', { code });
  assert.deepEqual(await f.call(bob, 'rooms:joinRequestStatus', { code }), { ok: true, code, pending: false });
  for (let i = 0; i < 5; i++) await f.call(alice, 'room:addBot', { difficulty: 'easy' });
  assert.match((await f.ack(bob, 'rooms:requestJoin', { code })).error, /full/i);
  await f.call(alice, 'room:removeBot', { token: alice.state.room.seats.find((seat) => seat.isBot).token });
  await f.call(bob, 'rooms:requestJoin', { code });
  const endedRequest = f.saved().rooms[0].joinRequests[0].requestId;
  await f.call(alice, 'room:start');
  assert.deepEqual(f.saved().rooms[0].joinRequests, []);
  assert.deepEqual(await f.call(bob, 'rooms:joinRequestStatus', { code }), { ok: true, code, pending: false });
  assert.match((await f.ack(bob, 'rooms:requestJoin', { code })).error, /started/i);
  assert.match((await f.ack(alice, 'room:approveJoin', { requestId: endedRequest })).error, /ended/i);
  assert.equal(bob.state, null);
  assert.deepEqual((await f.call(bob, 'rooms:list')).rooms, []);

  const { code: practiceCode } = await f.call(alice, 'rooms:create', { practice: true });
  assert.match((await f.ack(bob, 'rooms:requestJoin', { code: practiceCode })).error, /does not accept/i);
  assert.deepEqual(await f.call(bob, 'rooms:joinRequestStatus', { code: practiceCode }), { ok: true, code: practiceCode, pending: false });
  const { code: closedCode } = await f.call(alice, 'rooms:create');
  await f.call(bob, 'rooms:requestJoin', { code: closedCode });
  await f.call(alice, 'room:close');
  assert.deepEqual(await f.call(bob, 'rooms:joinRequestStatus', { code: closedCode }), { ok: true, code: closedCode, pending: false });
  assert.match((await f.ack(bob, 'rooms:requestJoin', { code: closedCode })).error, /not accepting/i);
  assert.deepEqual(await f.call(bob, 'rooms:joinRequestStatus', { code: 'ZZZZZ' }), { ok: true, code: 'ZZZZZ', pending: false });
  assert.match((await f.ack(bob, 'rooms:requestJoin', { code: 'too long' })).error, /five-character/i);
});

test('failed approval save grants no membership; recovery keeps the request available for explicit host retry', async (t) => {
  const f = await fixture(t);
  const alice = await f.connect('alice');
  const bob = await f.connect('bob');
  const { code } = await f.call(alice, 'rooms:create');
  await f.call(bob, 'rooms:requestJoin', { code });
  const requestId = f.saved().rooms[0].joinRequests[0].requestId;
  f.control.fail = true;
  const failed = await f.ack(alice, 'room:approveJoin', { requestId });
  assert.equal(failed.retryable, true);
  assert.equal(failed.approved, undefined);
  assert.equal(f.saved().rooms[0].members.bob, undefined);
  assert.equal(f.instance().durable.rooms.get(code).members.bob, undefined);
  assert.equal(f.instance().durable.rooms.get(code).seats.length, 1);
  assert.deepEqual(await f.call(bob, 'rooms:joinRequestStatus', { code }), { ok: true, code, pending: true });
  assert.deepEqual((await f.call(bob, 'rooms:list')).rooms, []);
  f.control.fail = false;
  assert.equal(await f.instance().durable.recover(), true);
  await f.call(alice, 'room:approveJoin', { requestId });
  assert.deepEqual(await f.call(bob, 'rooms:joinRequestStatus', { code }), { ok: true, code, member: true });
});

test('pending code requests are capped, restored exactly, and reject corrupt account references', () => {
  const manager = new RoomManager();
  const profile = (id) => ({ id, displayName: id, avatarId: 'lake-canoe', useGooglePhoto: false, photoUrl: null });
  manager.accounts.set('host', profile('host'));
  const room = manager.createRoom('Request capacity', { token: 'account:host', accountId: 'host', name: 'Host' });
  for (let i = 0; i <= MAX_JOIN_REQUESTS; i++) manager.accounts.set(`request-${i}`, profile(`request-${i}`));
  for (let i = 0; i < MAX_JOIN_REQUESTS; i++) assert.equal(manager.requestJoin(room, `request-${i}`).pending, true);
  assert.equal(manager.requestJoin(room, 'request-0').pending, true);
  assert.equal(room.joinRequests.length, MAX_JOIN_REQUESTS);
  assert.match(manager.requestJoin(room, `request-${MAX_JOIN_REQUESTS}`).error, /review/i);
  const snapshot = structuredClone(manager.toSnapshot());
  const restored = new RoomManager(); restored.loadSnapshot(snapshot);
  assert.deepEqual(restored.get(room.code).joinRequests, room.joinRequests);
  restored.denyJoin(restored.get(room.code), room.joinRequests[0].requestId);
  assert.equal(restored.requestJoin(restored.get(room.code), `request-${MAX_JOIN_REQUESTS}`).pending, true);
  const missingAccount = structuredClone(snapshot); missingAccount.rooms[0].joinRequests[0].accountId = 'missing';
  assert.throws(() => new RoomManager().loadSnapshot(missingAccount), /saved join requests/i);
  const duplicate = structuredClone(snapshot); duplicate.rooms[0].joinRequests[1] = structuredClone(duplicate.rooms[0].joinRequests[0]);
  assert.throws(() => new RoomManager().loadSnapshot(duplicate), /saved join requests/i);
});

test('guest practice is isolated and cannot become a shared lobby or claim signed-in seats', async (t) => {
  const f = await fixture(t);
  const guest = await f.connect();
  const another = await f.connect();
  await f.call(guest, 'hello', { token: 'synthetic-guest-proof', name: 'Practice' });
  await f.call(another, 'hello', { token: 'synthetic-other-proof', name: 'Other' });
  assert.equal((await f.ack(guest, 'rooms:create', { roomName: 'Shared?' })).code, 'AUTH_REQUIRED');
  const { code } = await f.call(guest, 'rooms:create', { practice: true });
  assert.deepEqual((await f.call(another, 'rooms:list')).rooms, []);
  assert.equal((await f.ack(another, 'rooms:join', { code })).code, 'AUTH_REQUIRED');
  assert.equal((await f.ack(guest, 'room:invite')).code, 'AUTH_REQUIRED');
  const alice = await f.connect('alice');
  assert.match((await f.ack(alice, 'rooms:join', { code })).error, /invitation/i);
  await f.call(alice, 'profile:claimLegacy', { token: 'synthetic-guest-proof' });
  await f.call(guest, 'hello', { token: 'synthetic-guest-proof', roomCode: code });
  assert.equal(f.instance().io.of('/').sockets.get(guest.socket.id).data.roomCode, null);
});

test('private chat stops reaching expired accounts and legacy guests after their seat is claimed', async (t) => {
  const f = await fixture(t);
  const alice = await f.connect('alice');
  const bob = await f.connect('bob');
  await f.call(alice, 'rooms:create');
  await f.call(bob, 'rooms:join', await f.call(alice, 'room:invite'));
  const bobMessages = [];
  bob.socket.on('chat:message', (message) => bobMessages.push(message.text));
  await f.call(alice, 'chat:send', { text: 'While signed in' });
  await f.call(bob, 'rooms:list'); // A round trip drains earlier events on this socket.
  assert.deepEqual(bobMessages, ['While signed in']);
  f.instance().io.of('/').sockets.get(bob.socket.id).data.authExpiresAt = 1;
  await f.call(alice, 'chat:send', { text: 'After expiry' });
  assert.equal((await f.ack(bob, 'rooms:list')).code, 'AUTH_EXPIRED');
  assert.deepEqual(bobMessages, ['While signed in']);

  const guest = await f.connect();
  const proof = 'synthetic-practice-chat-proof';
  await f.call(guest, 'hello', { token: proof });
  const { code } = await f.call(guest, 'rooms:create', { practice: true });
  const guestMessages = [];
  guest.socket.on('chat:message', (message) => guestMessages.push(message.text));
  await f.call(alice, 'profile:claimLegacy', { token: proof });
  await f.call(alice, 'rooms:join', { code });
  await f.call(alice, 'chat:send', { text: 'For the profile owner' });
  await f.call(guest, 'rooms:list');
  assert.deepEqual(guestMessages, []);
});

test('explicit legacy proof attaches existing hands to an account across restart; another account cannot claim it', async (t) => {
  const manager = new RoomManager();
  const proof = 'synthetic-old-saved-player-proof';
  const room = manager.createRoom('Old family save', { token: proof, name: 'Old player' });
  manager.joinSeat(room, { token: 'synthetic-other-old-proof', name: 'Other player' });
  manager.startGame(room, () => {}, { resumeRuntime: false });
  room.game.suspendRuntime();
  const initial = manager.toSnapshot(); initial.version = 2; delete initial.accounts;
  for (const saved of initial.rooms) { delete saved.members; delete saved.visibility; }
  const hand = structuredClone(room.game.getPlayer(proof).hand);
  const f = await fixture(t, initial);
  let alice = await f.connect('alice');
  const bob = await f.connect('bob');
  assert.deepEqual((await f.call(alice, 'rooms:list')).rooms, []);
  assert.equal((await f.call(alice, 'profile:claimLegacy', { token: 'synthetic-wrong-proof' })).claimed, 0);
  assert.equal((await f.call(alice, 'profile:claimLegacy', { token: proof })).claimed, 1);
  assert.match((await f.ack(bob, 'profile:claimLegacy', { token: proof })).error, /another account/i);
  await f.call(alice, 'rooms:join', { code: room.code });
  assert.deepEqual(alice.state.game.players.find((p) => p.id === alice.state.you).hand, hand);
  const seatId = alice.state.you;
  await f.restart();
  alice = await f.connect('alice');
  assert.equal((await f.call(alice, 'rooms:list')).rooms[0].code, room.code);
  await f.call(alice, 'rooms:join', { code: room.code });
  assert.equal(alice.state.you, seatId);
  assert.deepEqual(alice.state.game.players.find((p) => p.id === seatId).hand, hand);
  assert.ok(!JSON.stringify(f.wire).includes(proof), 'Legacy proof never becomes a public seat identifier');
});

test('stale buy/pass/draw taps cannot affect the next discard; durable receipts and exact hands recover', async (t) => {
  const f = await fixture(t);
  let alice = await f.connect('alice');
  let bob = await f.connect('bob');
  const { code } = await f.call(alice, 'rooms:create');
  const invite = await f.call(alice, 'room:invite');
  await f.call(bob, 'rooms:join', invite);
  await f.call(alice, 'room:settings', { buyWindowMs: 0 });
  await f.call(alice, 'room:start');
  await f.call(bob, 'rooms:list'); // Host acknowledgement does not flush Bob's socket.
  let current = alice.state.game.currentPlayerId === alice.state.you ? alice : bob;
  let buyer = current === alice ? bob : alice;
  const decisionId = current.state.game.buyDecisionId;
  assert.equal((await f.ack(current, 'game:draw', { from: 'deck' })).code, 'CLIENT_REFRESH_REQUIRED');
  await f.call(current, 'game:draw', { from: 'deck', decisionId });
  assert.equal(current.state.game.pendingDraw, true);
  await f.call(buyer, 'game:buy', { decisionId });
  assert.equal(buyer.state.game.buyReceipt.outcome, 'bought');
  assert.equal(buyer.state.game.buyReceipt.decisionId, decisionId);
  const receipt = structuredClone(buyer.state.game.buyReceipt);
  const receiptOwner = buyer === alice ? 'alice' : 'bob';
  const currentHand = current.state.game.players.find((p) => p.id === current.state.you).hand;
  await f.call(current, 'game:discard', { cardId: currentHand.find((card) => !card.joker).id });
  const nextDecision = current.state.game.buyDecisionId;
  assert.notEqual(nextDecision, decisionId);
  const before = f.saved().rooms[0].game;
  for (const event of ['game:buy', 'game:pass', 'game:cancelBuy', 'game:draw']) {
    assert.match((await f.ack(buyer, event, { decisionId, from: 'deck' })).error, /table has moved/i);
  }
  assert.deepEqual(f.saved().rooms[0].game, before, 'Rejected stale taps do not commit a changed hand or decision');
  await f.restart();
  alice = await f.connect('alice'); bob = await f.connect('bob');
  await f.call(alice, 'rooms:join', { code }); await f.call(bob, 'rooms:join', { code });
  const restored = receiptOwner === 'alice' ? alice : bob;
  assert.deepEqual(restored.state.game.buyReceipt, receipt);
  assert.equal(restored.state.game.buyDecisionId, nextDecision);
});

test('players with no buys remaining never block a held draw; expired decisions cannot buy late', async () => {
  const game = new Game([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], () => {}, { buyWindowMs: 0 });
  game.startNextRound();
  const current = game.currentPlayer();
  const other = game.players.find((p) => p !== current);
  game.buysUsed[other.id] = 3;
  game.draw(current.id, 'deck');
  assert.equal(game.turnPhase, 'action'); assert.equal(game.buyWindow, null);
  game.destroy();
  const timed = new Game([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], () => {}, { buyWindowMs: 20 });
  timed.startNextRound();
  const late = timed.players.find((p) => p !== timed.currentPlayer());
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(timed.buyDecisionClosed, true);
  assert.throws(() => timed.requestBuy(late.id), /ended/);
  assert.equal(timed.viewFor(late.id).buyReceipt.outcome, 'expired');
  timed.destroy();
});
