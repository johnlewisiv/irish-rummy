// Local end-to-end regression coverage. All identities and saves are synthetic.
// Run from the project root: node --test tests/socket-recovery.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const requireClient = createRequire(new URL('../client/package.json', import.meta.url));
const { io } = requireClient('socket.io-client');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const debug = (...args) => { if (process.env.QA_DEBUG) console.error('[socket QA]', ...args); };

async function until(predicate, message, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(20);
  }
  throw new Error(message);
}

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'irish-rummy-socket-test-'));
  const stateFile = path.join(directory, 'rooms.json');
  const port = await freePort();
  debug('port selected', port);
  const url = `http://127.0.0.1:${port}`;
  const clients = [];
  const wire = [];
  let child;
  let logs = '';

  async function start() {
    debug('starting local test server');
    logs = '';
    child = spawn(process.execPath, ['--input-type=module', '-e', "import { createGameServer } from './server/src/index.js'; const server = await createGameServer({ allowLegacySessions: true }); await server.listen();"], {
      cwd: root,
      env: {
        ...process.env, NODE_ENV: 'test', PORT: String(port), BASE_PATH: '',
        ROOM_STATE_FILE: stateFile, IRISH_RUMMY_STATE_FILE: stateFile,
        DATABASE_URL: '', IRISH_RUMMY_DATABASE_URL: '', BUY_WINDOW_MS: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (data) => { logs += data; });
    child.stderr.on('data', (data) => { logs += data; });
    try {
      await until(async () => {
        if (child.exitCode !== null) throw new Error('Test server exited before becoming ready');
        try { return (await fetch(`${url}/healthz`)).ok; } catch { return false; }
      }, 'Test server did not start within 30 seconds', 30000);
    } catch (error) { throw new Error(`${error.message}\n${logs}`); }
    debug('local test server ready');
  }

  async function stop() {
    debug('stopping local test server', child?.exitCode, child?.signalCode);
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGKILL'); // Recovery must work after an ungraceful process stop.
    await exited;
  }

  function attach(socket) {
    const peer = { socket, state: null, history: [], events: [] };
    socket.onAny((event, ...args) => {
      wire.push({ event, args });
      peer.events.push({ event, args });
      if (event === 'room:state') peer.state = args[0];
      if (event === 'chat:history') peer.history = args[0];
    });
    clients.push(socket);
    return peer;
  }

  async function connect() {
    debug('connecting test player');
    const socket = io(url, { autoConnect: false, reconnection: false, transports: ['websocket'], forceNew: true });
    const peer = attach(socket);
    socket.connect();
    await until(() => socket.connected, 'Test player did not connect');
    return peer;
  }

  async function ack(peer, event, payload = {}) {
    debug('sending', event);
    const response = await new Promise((resolve, reject) => {
      peer.socket.timeout(6000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result));
    });
    wire.push({ event: `${event}:ack`, args: [response] });
    return response;
  }

  async function call(peer, event, payload = {}) {
    const response = await ack(peer, event, payload);
    assert.equal(response?.error, undefined, `${event}: ${response?.error}`);
    return response;
  }

  async function state(peer, predicate = () => true) {
    await until(() => peer.state && predicate(peer.state), 'Expected personalized room state was not received');
    return peer.state;
  }

  t.after(async () => {
    for (const socket of clients) socket.disconnect();
    await stop();
    await fs.rm(directory, { recursive: true, force: true });
  });
  await start();
  return { url, stateFile, connect, attach, ack, call, state, start, stop, wire };
}

function ownHand(state) {
  return state.game.players.find((player) => player.id === state.you)?.hand;
}

function gameCore(snapshot, code) {
  const game = structuredClone(snapshot.rooms.find((room) => room.code === code).game);
  for (const player of game.players) delete player.connected;
  return game;
}

function assertNoSecrets(wire, secrets) {
  for (const entry of wire) {
    const serialized = JSON.stringify(entry.args);
    for (const secret of secrets) assert.ok(!serialized.includes(secret), `Bearer identity leaked through ${entry.event}`);
  }
}

test('two players and a spectator retain private hands, buy state, chat and exact saved game after reload and process loss', { timeout: 90000 }, async (t) => {
  const f = await fixture(t);
  const tokens = ['synthetic-alice-private-token', 'synthetic-bob-private-token', 'synthetic-viewer-private-token'];
  let alice = await f.connect();
  let bob = await f.connect();
  let viewer = await f.connect();
  await f.call(alice, 'hello', { token: tokens[0], name: 'Alice', rejoin: false });
  await f.call(bob, 'hello', { token: tokens[1], name: 'Bob', rejoin: false });
  await f.call(viewer, 'hello', { token: tokens[2], name: 'Viewer', rejoin: false });
  const { code } = await f.call(alice, 'rooms:create', { roomName: 'Synthetic Friday table' });
  await f.call(alice, 'room:settings', { buyWindowMs: 0 });
  await f.call(bob, 'rooms:join', { code });
  await f.call(viewer, 'rooms:join', { code, spectate: true });
  await f.call(alice, 'room:start');
  for (const peer of [alice, bob, viewer]) await f.state(peer, (s) => s.game?.phase === 'playing');
  for (const peer of [alice, bob]) {
    assert.equal(ownHand(peer.state).length, peer.state.game.contract.deal);
    assert.equal(peer.state.game.players.find((p) => p.id !== peer.state.you).hand, undefined);
  }
  assert.equal(viewer.state.role, 'spectator');
  assert.ok(viewer.state.game.players.every((p) => p.hand === undefined));
  assert.match((await f.ack(viewer, 'game:draw', { from: 'deck' })).error, /Spectators/);

  const current = alice.state.game.currentPlayerId === alice.state.you ? alice : bob;
  const buyer = current === alice ? bob : alice;
  await f.call(buyer, 'game:buy');
  await f.state(viewer, (s) => s.game.buyRequests.includes(buyer.state.you));
  assertNoSecrets(f.wire, tokens);
  await f.call(buyer, 'game:cancelBuy');
  await f.call(buyer, 'game:pass');
  await f.call(current, 'game:draw', { from: 'deck' });
  await f.call(alice, 'chat:send', { text: 'Synthetic recovery check' });
  for (const peer of [alice, bob]) await f.state(peer, (s) => s.game.turnPhase === 'action');
  const aliceHand = structuredClone(ownHand(alice.state));
  const bobHand = structuredClone(ownHand(bob.state));
  const alicePublicId = alice.state.you;
  const bobPublicId = bob.state.you;

  bob.socket.disconnect();
  bob = await f.connect();
  assert.equal((await f.call(bob, 'hello', { token: tokens[1], name: 'Bob', roomCode: code })).rejoined, code);
  await f.state(bob, (s) => s.game?.turnPhase === 'action');
  assert.deepEqual(ownHand(bob.state), bobHand);
  assert.equal(bob.state.you, bobPublicId);
  await until(() => bob.history.some((message) => message.text === 'Synthetic recovery check'), 'Reload did not restore chat');
  assert.equal((await f.call(viewer, 'hello', { token: tokens[2], name: 'Viewer', roomCode: code })).rejoined, code);
  viewer.socket.disconnect();
  viewer = await f.connect();
  assert.equal((await f.call(viewer, 'hello', { token: tokens[2], name: 'Viewer', roomCode: code })).rejoined, code);
  await f.state(viewer, (s) => s.game?.turnPhase === 'action');
  assert.equal(viewer.state.role, 'spectator');
  assert.ok(viewer.state.game.players.every((p) => p.hand === undefined));

  const before = gameCore(JSON.parse(await fs.readFile(f.stateFile, 'utf8')), code);
  await f.stop();
  await f.start();
  alice = await f.connect();
  bob = await f.connect();
  viewer = await f.connect();
  for (const [i, peer] of [alice, bob, viewer].entries()) {
    assert.equal((await f.call(peer, 'hello', { token: tokens[i], name: ['Alice', 'Bob', 'Viewer'][i], roomCode: code })).rejoined, code);
    await f.state(peer, (s) => s.room.code === code && s.game?.turnPhase === 'action');
  }
  assert.deepEqual(ownHand(alice.state), aliceHand);
  assert.deepEqual(ownHand(bob.state), bobHand);
  assert.equal(alice.state.you, alicePublicId);
  assert.equal(bob.state.you, bobPublicId);
  assert.equal(viewer.state.role, 'spectator');
  assert.ok(viewer.state.game.players.every((p) => p.hand === undefined));
  const after = gameCore(JSON.parse(await fs.readFile(f.stateFile, 'utf8')), code);
  assert.deepEqual(after, before, 'Every persisted game field except presence must survive restart exactly');
  assertNoSecrets(f.wire, tokens);

  // The same saved player can have multiple unfinished family games.
  const secondCode = (await f.call(alice, 'rooms:create', { roomName: 'Synthetic Sunday table' })).code;
  await f.call(bob, 'rooms:join', { code: secondCode });
  await f.call(alice, 'room:start');
  assert.equal((await f.call(alice, 'hello', { token: tokens[0], name: 'Alice', roomCode: code })).rejoined, code);
  assert.equal((await f.call(alice, 'hello', { token: tokens[0], name: 'Alice', roomCode: secondCode })).rejoined, secondCode);
  const lobby = await f.call(alice, 'hello', { token: tokens[0], name: 'Alice', rejoin: false });
  assert.equal(lobby.rejoined, undefined);
  assert.match((await f.ack(alice, 'game:draw', { from: 'deck' })).error, /No game|not in a room/i);
  const missing = await f.call(alice, 'hello', { token: tokens[0], name: 'Alice', roomCode: 'ZZZZZ' });
  assert.equal(missing.rejoined, undefined, 'A missing requested room must not reopen an unrelated game');
  assertNoSecrets(f.wire, tokens);
});

test('actual client rejects offline and pre-recovery moves without replay; failed saves restore the last committed hand', { timeout: 90000 }, async (t) => {
  const f = await fixture(t);
  const originalWindow = globalThis.window;
  const originalLocation = globalThis.location;
  globalThis.location = new URL(f.url);
  globalThis.window = { location: globalThis.location };
  const client = await import('../client/src/socket.js');
  const host = f.attach(client.socket);
  client.socket.connect(); // App starts the socket after loading account configuration.
  t.after(() => {
    client.socket.disconnect();
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation;
  });
  await until(() => client.socket.connected, 'Application socket did not connect');
  const hostToken = 'synthetic-client-host-secret';
  const otherToken = 'synthetic-client-other-secret';
  await client.call('hello', { token: hostToken, name: 'Host', rejoin: false });
  const other = await f.connect();
  await f.call(other, 'hello', { token: otherToken, name: 'Other', rejoin: false });
  const { code } = await client.call('rooms:create', { roomName: 'Synthetic connection table' });
  await f.call(other, 'rooms:join', { code });
  await client.call('room:start');
  await f.state(host, (s) => s.game?.phase === 'playing');
  await f.state(other, (s) => s.game?.phase === 'playing');
  if (host.state.game.currentPlayerId !== host.state.you) {
    await f.call(other, 'game:draw', { from: 'discard' });
    await f.state(other, (s) => s.game.turnPhase === 'action');
    await f.call(other, 'game:discard', { cardId: ownHand(other.state)[0].id });
    await f.state(host, (s) => s.game.currentPlayerId === s.you && s.game.turnPhase === 'draw');
  }
  const handBefore = structuredClone(ownHand(host.state));
  client.socket.disconnect();
  await assert.rejects(client.call('game:draw', { from: 'discard' }), /offline/);
  assert.equal(client.socket.sendBuffer.length, 0, 'Offline move was buffered');
  client.socket.connect();
  await until(() => client.socket.connected, 'Application socket did not reconnect');
  await assert.rejects(client.call('game:draw', { from: 'discard' }), /still reconnecting/);
  await client.call('hello', { token: hostToken, name: 'Host', roomCode: code });
  await f.state(host, (s) => s.game.turnPhase === 'draw');
  assert.deepEqual(ownHand(host.state), handBefore);
  await assert.rejects(client.call('game:discard', { cardId: handBefore[0].id }), /draw|phase|first/i);
  assert.equal(client.socket.sendBuffer.length, 0);

  // Force a local disk write failure without modifying or deleting its saved data.
  const committed = await fs.readFile(f.stateFile, 'utf8');
  const backup = `${f.stateFile}.known-good`;
  await fs.rename(f.stateFile, backup);
  await fs.mkdir(f.stateFile);
  const statesBefore = host.events.filter((event) => event.event === 'room:state').length;
  await assert.rejects(client.call('game:draw', { from: 'discard' }), /sav|temporarily unavailable/i);
  assert.equal(host.events.filter((event) => event.event === 'room:state').length, statesBefore, 'Failed save broadcast an uncommitted move');
  assert.equal(await fs.readFile(backup, 'utf8'), committed);
  await f.stop();
  await fs.rmdir(f.stateFile);
  await fs.rename(backup, f.stateFile);
  await f.start();
  client.socket.connect();
  await until(() => client.socket.connected, 'Application socket did not reconnect after saved-state recovery');
  await client.call('hello', { token: hostToken, name: 'Host', roomCode: code });
  await f.state(host, (s) => s.game.turnPhase === 'draw');
  assert.deepEqual(ownHand(host.state), handBefore, 'Offline, rejected, or uncommitted move changed the restored hand');
  await client.call('game:draw', { from: 'discard' });
  await f.state(host, (s) => s.game.turnPhase === 'action');
  assert.equal(ownHand(host.state).length, handBefore.length + 1, 'A move was replayed or committed more than once');
  assertNoSecrets(f.wire, [hostToken, otherToken]);
});

test('a saved untimed held draw resolves when its player returns and all buyers remain offline', { timeout: 90000 }, async (t) => {
  const f = await fixture(t);
  const first = await f.connect();
  const second = await f.connect();
  const firstToken = 'synthetic-untimed-first-secret';
  const secondToken = 'synthetic-untimed-second-secret';
  await f.call(first, 'hello', { token: firstToken, name: 'First', rejoin: false });
  await f.call(second, 'hello', { token: secondToken, name: 'Second', rejoin: false });
  const { code } = await f.call(first, 'rooms:create', { roomName: 'Untimed recovery' });
  await f.call(second, 'rooms:join', { code });
  await f.call(first, 'room:start');
  await f.state(first, (s) => s.game?.phase === 'playing');
  await f.state(second, (s) => s.game?.phase === 'playing');
  const current = first.state.game.currentPlayerId === first.state.you ? first : second;
  const buyer = current === first ? second : first;
  const currentToken = current === first ? firstToken : secondToken;
  const initialHandCount = ownHand(current.state).length;
  await f.call(current, 'game:draw', { from: 'deck' });
  await f.state(current, (s) => s.game.buyWindow?.pendingDraw === true);
  const currentId = current.state.you;
  current.socket.disconnect();
  await f.state(buyer, (s) => s.game.players.find((p) => p.id === currentId)?.connected === false);
  buyer.socket.disconnect();
  await until(async () => (await fetch(`${f.url}/healthz`)).ok, 'Server not ready before restart');
  await f.stop();
  await f.start();
  const returned = await f.connect();
  assert.equal((await f.call(returned, 'hello', { token: currentToken, name: 'Returned', roomCode: code })).rejoined, code);
  await f.state(returned, (s) => s.game?.turnPhase === 'action');
  assert.equal(ownHand(returned.state).length, initialHandCount + 1);
  assert.equal(returned.state.game.buyWindow, null);
});

test('an uncertain committed room closure removes every stale client attachment after recovery', { timeout: 15000 }, async (t) => {
  const { createGameServer } = await import('../server/src/index.js');
  let committed = null;
  let failAfterCommit = false;
  const stateStore = {
    enabled: true,
    kind: 'test',
    async load() { return structuredClone(committed); },
    async save(snapshot) {
      committed = structuredClone(snapshot);
      if (failAfterCommit) {
        failAfterCommit = false;
        const error = new Error('Synthetic connection loss after commit');
        error.code = 'ETIMEDOUT';
        throw error;
      }
      return true;
    },
    async close() {},
  };
  const instance = await createGameServer({ stateStore, allowLegacySessions: true });
  const clients = [];
  const events = [];
  t.after(async () => {
    for (const peer of clients) peer.socket.disconnect();
    await instance.close();
  });
  const address = await instance.listen(0, '127.0.0.1');
  const connect = async () => {
    const socket = io(`http://127.0.0.1:${address.port}`, { autoConnect: false, reconnection: false, transports: ['websocket'], forceNew: true });
    const peer = { socket, closed: [] };
    clients.push(peer);
    socket.onAny((event, ...args) => {
      events.push({ event, args });
      if (event === 'room:closed') peer.closed.push(args[0]);
    });
    socket.connect();
    await until(() => socket.connected, 'Close-recovery player did not connect');
    return peer;
  };
  const ack = async (peer, event, payload = {}) => {
    const result = await new Promise((resolve, reject) => {
      peer.socket.timeout(5000).emit(event, payload, (error, response) => error ? reject(error) : resolve(response));
    });
    events.push({ event: `${event}:ack`, args: [result] });
    return result;
  };
  const call = async (peer, event, payload = {}) => {
    const result = await ack(peer, event, payload);
    assert.equal(result?.error, undefined, `${event}: ${result?.error}`);
    return result;
  };
  const host = await connect();
  const guest = await connect();
  const tokens = ['synthetic-uncertain-close-host', 'synthetic-uncertain-close-guest'];
  await call(host, 'hello', { token: tokens[0], name: 'Host', rejoin: false });
  await call(guest, 'hello', { token: tokens[1], name: 'Guest', rejoin: false });
  const { code } = await call(host, 'rooms:create', { roomName: 'Synthetic uncertain close' });
  await call(guest, 'rooms:join', { code });
  await call(host, 'room:start');
  failAfterCommit = true;
  const failure = await ack(host, 'room:close', { code });
  assert.equal(failure.retryable, true);
  assert.equal(committed.rooms.length, 0, 'The close must have reached the authoritative store');
  assert.ok(instance.durable.rooms.get(code), 'The server should wait on its rollback view until recovery');
  assert.equal(host.closed.length, 0);
  assert.equal(guest.closed.length, 0);

  assert.equal(await instance.durable.recover(), true);
  await until(() => clients.every((peer) => peer.closed.some((room) => room.code === code)), 'Recovery did not notify every stale room client');
  for (const peer of clients) {
    const binding = instance.io.of('/').sockets.get(peer.socket.id).data;
    assert.equal(binding.roomCode, null);
    assert.equal(binding.role, null);
    assert.match((await ack(peer, 'game:draw', { from: 'deck' })).error, /No game|not in a room/i);
  }
  assert.deepEqual((await call(host, 'rooms:list')).rooms, []);
  assertNoSecrets(events, tokens);
});
