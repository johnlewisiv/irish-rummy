// index.js — Express + Socket.io server.
// Serves the built React client and handles all real-time game traffic.
//
//   PORT       (default 3050)
//   BASE_PATH  path prefix when mounted behind a reverse proxy, e.g. "/rummy"

import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';
import { Err } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3050;
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/$/, ''); // '' or '/rummy'

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: `${BASE_PATH}/socket.io`,
  cors: { origin: true }, // dev convenience; same-origin in production
});

const rooms = new RoomManager();
setInterval(() => rooms.sweep(), 10 * 60 * 1000);

function closeRoom(room) {
  io.to(room.code).emit('room:closed', { code: room.code, name: room.name });
  for (const s of io.of('/').sockets.values()) {
    if (s.data.roomCode !== room.code) continue;
    s.leave(room.code);
    s.data.roomCode = null;
    s.data.role = null;
  }
  rooms.destroyRoom(room.code);
}

// ------------------------------------------------------------------
// Static client (built by `npm run build` in ../client)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(BASE_PATH || '/', express.static(clientDist));
app.get(`${BASE_PATH}/*`, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

// ------------------------------------------------------------------
// Socket protocol
io.on('connection', (socket) => {
  // socket.data: { token, name, roomCode, role }

  const user = () => ({ token: socket.data.token, name: socket.data.name });

  /** Send everyone in the room their personalized game state + room info. */
  function broadcastRoom(room) {
    const summary = {
      code: room.code,
      name: room.name,
      hostToken: room.hostToken,
      started: !!room.game,
      buyWindowMs: room.buyWindowMs,
      seats: room.seats.map((s) => ({
        token: s.token, name: s.name, isBot: s.isBot, difficulty: s.difficulty, avatar: s.avatar,
      })),
      spectatorCount: room.spectators.length,
    };
    for (const s of io.of('/').sockets.values()) {
      if (s.data.roomCode !== room.code) continue;
      const view = room.game ? room.game.viewFor(s.data.role === 'player' ? s.data.token : null) : null;
      s.emit('room:state', { room: summary, game: view, you: s.data.token, role: s.data.role });
    }
  }

  function currentRoom() {
    return socket.data.roomCode ? rooms.get(socket.data.roomCode) : null;
  }

  /** Wrap a handler: catch player-facing errors, ack {ok} or {error}. */
  const guard = (fn) => (payload, ack) => {
    try {
      const result = fn(payload || {});
      ack?.({ ok: true, ...(result || {}) });
    } catch (e) {
      if (e instanceof Err || e.playerFacing) ack?.({ error: e.message });
      else {
        console.error(e);
        ack?.({ error: 'Something went wrong on the server.' });
      }
    }
  };

  socket.on('hello', guard(({ token, name }) => {
    if (!token || typeof token !== 'string') throw new Err('Missing session token.');
    socket.data.token = token;
    socket.data.name = String(name || 'Player').slice(0, 20).trim() || 'Player';
    // Reconnect: if this token is already seated somewhere, rejoin that room.
    const found = rooms.findByToken(token);
    if (found) {
      socket.data.roomCode = found.room.code;
      socket.data.role = found.role;
      socket.join(found.room.code);
      const p = found.room.game?.getPlayer(token);
      if (p) p.connected = true;
      broadcastRoom(found.room);
      return { rejoined: found.room.code };
    }
    return {};
  }));

  socket.on('rooms:list', guard(() => ({ rooms: rooms.list(socket.data.token) })));

  socket.on('rooms:create', guard(({ roomName }) => {
    if (!socket.data.token) throw new Err('Sign in first.');
    const room = rooms.createRoom(String(roomName || '').slice(0, 30), user());
    socket.data.roomCode = room.code;
    socket.data.role = 'player';
    socket.join(room.code);
    broadcastRoom(room);
    return { code: room.code };
  }));

  socket.on('rooms:join', guard(({ code, spectate }) => {
    if (!socket.data.token) throw new Err('Sign in first.');
    const room = rooms.get(code);
    if (!room) throw new Err('Room not found.');
    const alreadySeated = room.seats.some((s) => s.token === socket.data.token);
    if (alreadySeated && !spectate) {
      socket.data.role = 'player';
      const p = room.game?.getPlayer(socket.data.token);
      if (p) p.connected = true;
    } else if (spectate || room.game) {
      if (!room.spectators.includes(socket.data.token)) room.spectators.push(socket.data.token);
      socket.data.role = 'spectator';
    } else {
      const res = rooms.joinSeat(room, user());
      if (res.error) throw new Err(res.error);
      socket.data.role = 'player';
    }
    socket.data.roomCode = room.code;
    socket.join(room.code);
    socket.emit('chat:history', room.chat.slice(-50));
    broadcastRoom(room);
    return { code: room.code, role: socket.data.role };
  }));

  socket.on('room:close', guard(({ code }) => {
    const room = code ? rooms.get(code) : currentRoom();
    if (!room) return {};
    if (room.hostToken !== socket.data.token) throw new Err('Only the host can close this game.');
    closeRoom(room);
    return { closed: true };
  }));

  socket.on('rooms:leave', guard(() => {
    const room = currentRoom();
    if (!room) return {};
    if (socket.data.role === 'spectator') {
      room.spectators = room.spectators.filter((t) => t !== socket.data.token);
    } else if (!room.game) {
      rooms.removeSeat(room, socket.data.token);
      if (room.seats.filter((s) => !s.isBot).length === 0) {
        rooms.destroyRoom(room.code);
        socket.leave(room.code);
        socket.data.roomCode = null;
        return {};
      }
      if (room.hostToken === socket.data.token) {
        room.hostToken = room.seats.find((s) => !s.isBot)?.token;
      }
    } else {
      const p = room.game.getPlayer(socket.data.token);
      if (p) p.connected = false; // mid-game: seat kept for reconnection
    }
    socket.leave(room.code);
    socket.data.roomCode = null;
    broadcastRoom(room);
    return {};
  }));

  socket.on('room:addBot', guard(({ difficulty }) => {
    const room = mustBeHost();
    const res = rooms.addBot(room, difficulty);
    if (res.error) throw new Err(res.error);
    broadcastRoom(room);
  }));

  socket.on('room:removeBot', guard(({ token }) => {
    const room = mustBeHost();
    if (room.game) throw new Err('Game already started.');
    room.seats = room.seats.filter((s) => !(s.isBot && s.token === token));
    broadcastRoom(room);
  }));

  socket.on('room:settings', guard(({ buyWindowMs }) => {
    const room = mustBeHost();
    if (room.game) throw new Err('Game already started.');
    const allowed = [0, 8000, 30000, 120000, 3600000];
    if (!allowed.includes(Number(buyWindowMs))) throw new Err('Invalid buy timer.');
    room.buyWindowMs = Number(buyWindowMs);
    broadcastRoom(room);
  }));

  socket.on('room:avatar', guard(({ avatar }) => {
    const room = currentRoom();
    if (!room) throw new Err('You are not in a room.');
    const res = rooms.setAvatar(room, socket.data.token, avatar);
    if (res.error) throw new Err(res.error);
    broadcastRoom(room);
  }));

  socket.on('room:start', guard(() => {
    const room = mustBeHost();
    const res = rooms.startGame(room, () => broadcastRoom(room));
    if (res.error) throw new Err(res.error);
    broadcastRoom(room);
  }));

  function mustBeHost() {
    const room = currentRoom();
    if (!room) throw new Err('You are not in a room.');
    if (room.hostToken !== socket.data.token) throw new Err('Only the host can do that.');
    return room;
  }

  // ---------------- in-game actions ----------------
  const gameAction = (fn) => guard((payload) => {
    const room = currentRoom();
    if (!room?.game) throw new Err('No game in progress.');
    if (socket.data.role !== 'player') throw new Err('Spectators cannot play.');
    fn(room.game, payload);
    broadcastRoom(room);
  });

  socket.on('game:draw', gameAction((g, { from }) => g.draw(socket.data.token, from)));
  socket.on('game:buy', gameAction((g) => g.requestBuy(socket.data.token)));
  socket.on('game:pass', gameAction((g) => g.passBuy(socket.data.token)));
  socket.on('game:pauseBuy', gameAction((g) => g.pauseBuy(socket.data.token)));
  socket.on('game:resumeBuy', gameAction((g) => g.resumeBuy(socket.data.token)));
  socket.on('game:cancelBuy', gameAction((g) => g.cancelBuy(socket.data.token)));
  socket.on('game:goDown', gameAction((g, { melds }) => g.goDown(socket.data.token, melds)));
  socket.on('game:layOff', gameAction((g, { meldId, cardId, end }) => g.layOff(socket.data.token, meldId, cardId, end)));
  socket.on('game:swapJoker', gameAction((g, { meldId, cardId }) => g.swapJoker(socket.data.token, meldId, cardId)));
  socket.on('game:discard', gameAction((g, { cardId }) => g.discard(socket.data.token, cardId)));

  // ---------------- chat ----------------
  socket.on('chat:send', guard(({ text }) => {
    const room = currentRoom();
    if (!room) throw new Err('You are not in a room.');
    const msg = {
      from: socket.data.name,
      role: socket.data.role,
      text: String(text || '').slice(0, 300),
      at: Date.now(),
    };
    if (!msg.text) return {};
    room.chat.push(msg);
    if (room.chat.length > 200) room.chat.shift();
    io.to(room.code).emit('chat:message', msg);
  }));

  socket.on('disconnect', () => {
    const room = currentRoom();
    if (!room) return;
    // Another tab may still be attached to the same token
    const stillHere = [...io.of('/').sockets.values()]
      .some((s) => s !== socket && s.data.token === socket.data.token && s.data.roomCode === room.code);
    if (stillHere) return;
    if (socket.data.role === 'spectator') {
      room.spectators = room.spectators.filter((t) => t !== socket.data.token);
    } else {
      const p = room.game?.getPlayer(socket.data.token);
      if (p) p.connected = false; // seat is kept — they can reconnect
      room.game?._maybeCloseBuyWindow(); // don't wait on someone who left
    }
    broadcastRoom(room);
  });
});

server.listen(PORT, () => {
  console.log(`Irish Rummy server listening on :${PORT}${BASE_PATH ? ` (base path ${BASE_PATH})` : ''}`);
});
