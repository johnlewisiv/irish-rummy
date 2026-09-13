// Server-authoritative socket protocol. Secrets and snapshots stay on the server.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Err } from './game.js';
import { createStateStore } from './persistence.js';
import { DurableRooms } from './durable-rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createGameServer({ stateStore = createStateStore(), basePath = process.env.BASE_PATH || '' } = {}) {
  const BASE_PATH = basePath.replace(/\/$/, '');
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { path: `${BASE_PATH}/socket.io`, maxHttpBufferSize: 100000 });
  let durable;
  const presence = () => {
    const online = new Map();
    for (const socket of io.of('/').sockets.values()) {
      if (socket.data.role !== 'player' || !socket.data.roomCode) continue;
      if (!online.has(socket.data.roomCode)) online.set(socket.data.roomCode, new Set());
      online.get(socket.data.roomCode).add(socket.data.token);
    }
    return online;
  };
  // The legacy field names remain compatible, but values are public seat IDs.
  // A raw session token must never leave the server as another person's identity.
  function publicView(room, value) {
    const identities = new Map(room.seats.map((seat) => [seat.token, seat.id]));
    const map = (item) => {
      if (typeof item === 'string') return identities.get(item) || item;
      if (Array.isArray(item)) return item.map(map);
      if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, val]) => [key, map(val)]));
      return item;
    };
    return map(value);
  }
  function spectatorCount(room) {
    return new Set([...io.of('/').sockets.values()].filter((socket) =>
      socket.data.roomCode === room.code && socket.data.role === 'spectator').map((socket) => socket.data.token)).size;
  }
  function broadcastRoom(room) {
    const summary = {
      code: room.code, name: room.name, hostToken: room.hostToken,
      started: !!room.game, buyWindowMs: room.buyWindowMs, updatedAt: room.updatedAt,
      seats: room.seats.map((s) => ({ token: s.token, name: s.name, isBot: s.isBot, difficulty: s.difficulty, avatar: s.avatar })),
      spectatorCount: spectatorCount(room),
    };
    for (const socket of io.of('/').sockets.values()) {
      if (socket.data.roomCode !== room.code) continue;
      const game = room.game ? room.game.viewFor(socket.data.role === 'player' ? socket.data.token : null) : null;
      socket.emit('room:state', publicView(room, { room: summary, game,
        you: room.seats.some((s) => s.token === socket.data.token) ? socket.data.token : socket.data.publicId,
        role: socket.data.role }));
    }
  }
  durable = new DurableRooms(stateStore, {
    onCommit: () => {
      // A close may have reached storage before its save response was lost.
      // Recovery must detach stale sockets even though the original close's
      // deferred effects never ran, otherwise clients display an unlocked ghost.
      for (const socket of io.of('/').sockets.values()) {
        const code = socket.data.roomCode;
        if (!code || durable.rooms.get(code)) continue;
        socket.emit('room:closed', { code, name: 'This game' });
        socket.leave(code);
        socket.data.roomCode = null;
        socket.data.role = null;
      }
      for (const room of durable.rooms.rooms.values()) broadcastRoom(room);
    },
    onStatus: (status) => io.emit('server:status', status), getPresence: presence,
  });
  try { await durable.initialize(); }
  catch (error) { await stateStore.close?.(); throw error; }
  const rooms = durable.rooms;
  const recoveryTimer = setInterval(() => durable.recover().catch(() => {}), 5000);
  recoveryTimer.unref();
  const changed = (room) => { room.updatedAt = Date.now(); };
  const emitAfter = (socket, event, data) => durable.afterCommit(() => socket.emit(event, data));
  const attach = (socket, room, role) => durable.afterCommit(() => {
    if (socket.data.roomCode) socket.leave(socket.data.roomCode);
    socket.data.roomCode = room?.code || null;
    socket.data.role = role || null;
    if (room) socket.join(room.code);
  });
  function markAway(socket, { leave = false } = {}) {
    const old = rooms.get(socket.data.roomCode);
    if (!old) return;
    const stillHere = [...io.of('/').sockets.values()].some((s) => s !== socket
      && s.data.token === socket.data.token && s.data.roomCode === old.code && s.data.role === socket.data.role);
    if (stillHere) return;
    if (socket.data.role === 'spectator') {
      if (leave) old.spectators = old.spectators.filter((t) => t !== socket.data.token);
    } else {
      const p = old.game?.getPlayer(socket.data.token);
      if (p) p.connected = false;
      // A family table pauses when everybody leaves; keep pending decisions.
      if (old.game?.players.some((p) => !p.isBot && p.connected)) old.game._maybeCloseBuyWindow();
    }
    changed(old);
  }
  function closeRoom(room) {
    rooms.destroyRoom(room.code);
    durable.afterCommit(() => {
      io.to(room.code).emit('room:closed', { code: room.code, name: room.name });
      for (const socket of io.of('/').sockets.values()) {
        if (socket.data.roomCode !== room.code) continue;
        socket.leave(room.code);
        socket.data.roomCode = null;
        socket.data.role = null;
      }
    });
  }
  app.get(`${BASE_PATH}/healthz`, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(durable.paused ? 503 : 200).json({ ok: !durable.paused,
      persistenceEnabled: stateStore.enabled, ...durable.status(), rooms: rooms.rooms.size });
  });
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(BASE_PATH || '/', express.static(clientDist));
  app.get(`${BASE_PATH}/*`, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

  io.on('connection', (socket) => {
    socket.data.publicId = randomUUID();
    socket.emit('server:status', durable.status());
    const user = () => ({ token: socket.data.token, name: socket.data.name });
    const currentRoom = () => rooms.get(socket.data.roomCode);
    const guard = (fn, { readOnly = false, hello = false } = {}) => (payload, ack) => {
      const respond = typeof ack === 'function' ? ack : () => {};
      durable.run(() => {
        if (!hello && !socket.data.token) throw new Err('Reconnect before continuing.');
        return fn(payload && typeof payload === 'object' ? payload : {});
      }, { readOnly }).then((result) => respond({ ok: true, ...(result || {}) })).catch((error) => {
        if (error instanceof Err || error.playerFacing) respond({ error: error.message, ...(error.retryable ? { retryable: true } : {}) });
        else { console.error(`Socket action failed (${error.code || error.name}).`); respond({ error: 'Something went wrong on the server.' }); }
      });
    };
    socket.on('hello', guard(({ token, name, roomCode, rejoin }) => {
      if (!token || typeof token !== 'string' || token.length > 256) throw new Err('Missing or invalid session token.');
      markAway(socket);
      const displayName = String(name || 'Player').slice(0, 20).trim() || 'Player';
      let found;
      if (rejoin !== false) {
        if (typeof roomCode === 'string' && roomCode) {
          const room = rooms.get(roomCode);
          if (room?.seats.some((s) => s.token === token)) found = { room, role: 'player' };
          else if (room?.spectators.includes(token)) found = { room, role: 'spectator' };
        } else if (roomCode === undefined) found = rooms.findByToken(token); // legacy clients
      }
      durable.afterCommit(() => { socket.data.token = token; socket.data.name = displayName; });
      attach(socket, found?.room, found?.role);
      if (found) {
        const p = found.room.game?.getPlayer(token);
        if (p) p.connected = found.role === 'player';
        // An untimed held draw may have been saved as the last family member
        // left. Recheck it now so an offline buyer cannot wedge the returner.
        if (found.role === 'player' && found.room.game?.buyWindow?.pendingDraw) found.room.game._maybeCloseBuyWindow();
        changed(found.room);
        emitAfter(socket, 'chat:history', found.room.chat.slice(-50));
        return { rejoined: found.room.code };
      }
      return roomCode && rejoin !== false ? { roomUnavailable: roomCode } : {};
    }, { hello: true }));
    socket.on('rooms:list', guard(() => ({ rooms: rooms.list(socket.data.token).map((room) => ({ ...room, spectators: spectatorCount(rooms.get(room.code)) })) }), { readOnly: true }));
    socket.on('rooms:create', guard(({ roomName }) => {
      markAway(socket, { leave: true });
      const room = rooms.createRoom(String(roomName || '').slice(0, 30), user());
      attach(socket, room, 'player');
      changed(room);
      return { code: room.code };
    }));
    socket.on('rooms:join', guard(({ code, spectate }) => {
      const room = rooms.get(typeof code === 'string' ? code : '');
      if (!room) throw new Err('Room not found.');
      const seated = room.seats.some((s) => s.token === socket.data.token);
      let role;
      if (seated && !spectate) role = 'player';
      else if (spectate || room.game) role = 'spectator';
      else { const res = rooms.joinSeat(room, user()); if (res.error) throw new Err(res.error); role = 'player'; }
      markAway(socket, { leave: true });
      if (role === 'spectator' && !room.spectators.includes(socket.data.token)) room.spectators.push(socket.data.token);
      if (role === 'player') room.spectators = room.spectators.filter((t) => t !== socket.data.token);
      const p = room.game?.getPlayer(socket.data.token);
      if (p) p.connected = role === 'player';
      if (role === 'player' && room.game?.buyWindow?.pendingDraw) room.game._maybeCloseBuyWindow();
      attach(socket, room, role);
      emitAfter(socket, 'chat:history', room.chat.slice(-50));
      changed(room);
      return { code: room.code, role };
    }));
    socket.on('room:close', guard(({ code }) => {
      const room = code ? rooms.get(typeof code === 'string' ? code : '') : currentRoom();
      if (!room) return {};
      if (room.hostToken !== socket.data.token) throw new Err('Only the host can close this game.');
      closeRoom(room);
      return { closed: true };
    }));
    socket.on('rooms:leave', guard(() => {
      const room = currentRoom();
      if (!room) return {};
      markAway(socket, { leave: true });
      // Leaving the table preserves the seat in lobbies and active games alike.
      attach(socket, null, null);
      changed(room);
    }));
    function mustBeHost() {
      const room = currentRoom();
      if (!room) throw new Err('You are not in a room.');
      if (room.hostToken !== socket.data.token) throw new Err('Only the host can do that.');
      return room;
    }
    socket.on('room:addBot', guard(({ difficulty }) => {
      const room = mustBeHost();
      if (!['easy', 'medium', 'hard', 'extreme'].includes(difficulty)) throw new Err('Unknown bot difficulty.');
      const res = rooms.addBot(room, difficulty); if (res.error) throw new Err(res.error); changed(room);
    }));
    socket.on('room:removeBot', guard(({ token }) => {
      const room = mustBeHost();
      if (room.game) throw new Err('Game already started.');
      room.seats = room.seats.filter((s) => !(s.isBot && (s.id === token || s.token === token)));
      changed(room);
    }));
    socket.on('room:settings', guard(({ buyWindowMs }) => {
      const room = mustBeHost();
      if (room.game) throw new Err('Game already started.');
      if (![0, 8000, 30000, 120000, 3600000].includes(Number(buyWindowMs))) throw new Err('Invalid buy timer.');
      room.buyWindowMs = Number(buyWindowMs); changed(room);
    }));
    socket.on('room:avatar', guard(({ avatar }) => {
      const room = currentRoom(); if (!room) throw new Err('You are not in a room.');
      const res = rooms.setAvatar(room, socket.data.token, avatar); if (res.error) throw new Err(res.error); changed(room);
    }));
    socket.on('room:start', guard(() => {
      const room = mustBeHost();
      const res = rooms.startGame(room, () => changed(room), durable.gameOptions(room));
      if (res.error) throw new Err(res.error);
      const online = presence().get(room.code) || new Set();
      for (const player of room.game.players) player.connected = player.isBot || online.has(player.id);
      changed(room);
    }));
    const gameAction = (fn) => guard((payload) => {
      const room = currentRoom();
      if (!room?.game) throw new Err('No game in progress.');
      if (socket.data.role !== 'player') throw new Err('Spectators cannot play.');
      fn(room.game, payload); changed(room);
    });
    socket.on('game:draw', gameAction((g, { from }) => {
      if (!['deck', 'discard'].includes(from)) throw new Err('Choose the deck or discard pile.');
      g.draw(socket.data.token, from);
    }));
    socket.on('game:buy', gameAction((g) => g.requestBuy(socket.data.token)));
    socket.on('game:pass', gameAction((g) => g.passBuy(socket.data.token)));
    socket.on('game:pauseBuy', gameAction((g) => g.pauseBuy(socket.data.token)));
    socket.on('game:resumeBuy', gameAction((g) => g.resumeBuy(socket.data.token)));
    socket.on('game:cancelBuy', gameAction((g) => g.cancelBuy(socket.data.token)));
    socket.on('game:goDown', gameAction((g, { melds }) => g.goDown(socket.data.token, melds)));
    socket.on('game:layOff', gameAction((g, { meldId, cardId, end }) => g.layOff(socket.data.token, meldId, cardId, end)));
    socket.on('game:swapJoker', gameAction((g, { meldId, cardId }) => g.swapJoker(socket.data.token, meldId, cardId)));
    socket.on('game:discard', gameAction((g, { cardId }) => g.discard(socket.data.token, cardId)));
    socket.on('chat:send', guard(({ text }) => {
      const room = currentRoom(); if (!room) throw new Err('You are not in a room.');
      const msg = { from: socket.data.name, role: socket.data.role, text: String(text || '').slice(0, 300), at: Date.now() };
      if (!msg.text) return {};
      room.chat.push(msg); if (room.chat.length > 200) room.chat.shift(); changed(room);
      durable.afterCommit(() => io.to(room.code).emit('chat:message', msg));
    }));
    socket.on('disconnect', () => durable.run(() => markAway(socket)).catch(() => {}));
  });
  return { app, server, io, durable,
    async listen(port = process.env.PORT || 3050, host) {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      return server.address();
    },
    async close() {
      clearInterval(recoveryTimer);
      await durable.close();
      await new Promise((resolve) => io.close(resolve));
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const instance = await createGameServer();
    const address = await instance.listen();
    console.log(`Irish Rummy listening on :${address.port}; persistence: ${instance.durable.store.kind}; ${instance.durable.rooms.rooms.size} rooms restored.`);
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; await instance.close(); };
    process.on('SIGTERM', stop); process.on('SIGINT', stop);
  } catch (error) {
    console.error(`Irish Rummy could not safely load/save state (${error.code || error.name}). Check database access, migration, or state file; existing state was not reset.`);
    process.exitCode = 1;
  }
}
