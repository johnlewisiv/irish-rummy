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
import { createAuth, AuthError, publicProfile } from './auth.js';
import { normalizeAvatar } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createGameServer({ stateStore = createStateStore(), basePath = process.env.BASE_PATH || '', auth = createAuth(), allowLegacySessions = false } = {}) {
  const BASE_PATH = basePath.replace(/\/$/, '');
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { path: `${BASE_PATH}/socket.io`, maxHttpBufferSize: 100000 });
  let durable;
  const canAccess = (socket, room) => allowLegacySessions || (socket.data.accountId
    ? !!room.members[socket.data.accountId] && socket.data.authExpiresAt > Date.now()
    : room.visibility === 'practice' && room.hostToken === socket.data.token && !Object.values(room.members).some((m) => m.token === socket.data.token));
  const sharedPhoto = (room, token) => {
    const id = Object.entries(room.members).find(([, member]) => member.token === token)?.[0];
    const profile = durable.rooms.accounts.get(id);
    return profile?.useGooglePhoto ? profile.photoUrl : null;
  };
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
      visibility: room.visibility, started: !!room.game, buyWindowMs: room.buyWindowMs, updatedAt: room.updatedAt,
      seats: room.seats.map((s) => ({ token: s.token, name: s.name, isBot: s.isBot, difficulty: s.difficulty, avatar: s.avatar, photoUrl: sharedPhoto(room, s.token) })),
      spectatorCount: spectatorCount(room),
    };
    for (const socket of io.of('/').sockets.values()) {
      if (socket.data.roomCode !== room.code) continue;
      if (!canAccess(socket, room)) continue;
      const game = room.game ? room.game.viewFor(socket.data.role === 'player' ? socket.data.token : null) : null;
      if (game) for (const player of game.players) player.photoUrl = sharedPhoto(room, player.id);
      const hostRequests = room.hostToken === socket.data.token ? { joinRequests: room.joinRequests.map((request) => {
        const profile = rooms.accounts.get(request.accountId);
        return { requestId: request.requestId, displayName: profile.displayName, avatarId: profile.avatarId,
          photoUrl: profile.useGooglePhoto ? profile.photoUrl : null };
      }) } : {};
      socket.emit('room:state', publicView(room, { room: { ...summary, ...hostRequests }, game,
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
  app.get(`${BASE_PATH}/auth/config`, (_req, res) => { res.set('Cache-Control', 'no-store'); res.json(auth.config); });
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
    const user = () => ({ token: socket.data.accountId ? `account:${socket.data.accountId}` : socket.data.token, name: socket.data.name, accountId: socket.data.accountId, avatar: rooms.accounts.get(socket.data.accountId)?.avatarId });
    const requireAccount = () => { if (!socket.data.accountId) throw new AuthError(); return rooms.accounts.get(socket.data.accountId); };
    const assertSession = () => { if (socket.data.accountId && socket.data.authExpiresAt <= Date.now()) throw new AuthError('Your Google session has expired. Sign in again.', 'AUTH_EXPIRED'); };
    const currentRoom = () => {
      const room = rooms.get(socket.data.roomCode);
      if (room && !canAccess(socket, room)) throw new AuthError('Sign in to the account that owns this saved game.');
      return room;
    };
    const guard = (fn, { readOnly = false, hello = false } = {}) => (payload, ack) => {
      const respond = typeof ack === 'function' ? ack : () => {};
      durable.run(() => {
        if (!hello && !socket.data.token) throw new Err('Reconnect before continuing.');
        if (!hello) assertSession();
        return fn(payload && typeof payload === 'object' ? payload : {});
      }, { readOnly }).then((result) => respond({ ok: true, ...(result || {}) })).catch((error) => {
        if (error instanceof Err || error.playerFacing) respond({ error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.retryable ? { retryable: true } : {}) });
        else { console.error(`Socket action failed (${error.code || error.name}).`); respond({ error: 'Something went wrong on the server.' }); }
      });
    };
    // Network verification runs outside the synchronous durable mutation queue.
    // Sequence guard prevents a slow older hello from replacing a newer login.
    let helloSequence = 0;
    socket.on('hello', async (payload, ack) => {
      const sequence = ++helloSequence;
      const data = payload && typeof payload === 'object' ? payload : {};
      let identity;
      try { if (data.accessToken) identity = await auth.verify(data.accessToken); }
      catch (error) { if (typeof ack === 'function') ack({ error: error.playerFacing ? error.message : 'Sign-in could not be checked.', code: error.code || 'AUTH_UNAVAILABLE' }); return; }
      guard(({ token, name, roomCode, rejoin }) => {
        if (sequence !== helloSequence || !socket.connected) throw new AuthError('A newer sign-in replaced this request.', 'AUTH_EXPIRED');
        if (!identity && (!token || typeof token !== 'string' || token.length < 16 || token.length > 256 || token.startsWith('account:'))) throw new AuthError();
        markAway(socket);
        let profile;
        if (identity) {
          profile = rooms.accounts.get(identity.id);
          if (!profile) {
            profile = { id: identity.id, displayName: identity.displayName, avatarId: 'lake-canoe', photoUrl: identity.photoUrl || null, useGooglePhoto: false };
            rooms.accounts.set(identity.id, profile);
          } else profile.photoUrl = identity.photoUrl || null;
        }
        const defaultToken = identity ? `account:${identity.id}` : token;
        const displayName = profile?.displayName || String(name || 'Player').slice(0, 20).trim() || 'Player';
        let found;
        if (rejoin !== false) {
          const candidateRooms = roomCode ? [rooms.get(typeof roomCode === 'string' ? roomCode : '')] : allowLegacySessions && roomCode === undefined ? [...rooms.rooms.values()] : [];
          for (const room of candidateRooms) {
            if (!room) continue;
            const membership = identity && room.members[identity.id];
            const permitted = membership || allowLegacySessions || (!identity && room.visibility === 'practice' && room.hostToken === token && !Object.values(room.members).some((m) => m.token === token));
            if (!permitted) continue;
            const seatToken = membership?.token || defaultToken;
            if (room.seats.some((seat) => seat.token === seatToken)) found = { room, role: 'player', token: seatToken };
            else if (room.spectators.includes(seatToken)) found = { room, role: 'spectator', token: seatToken };
            if (found) break;
          }
        }
        durable.afterCommit(() => {
          socket.data.accountId = identity?.id || null;
          socket.data.authExpiresAt = identity?.expiresAt || null;
          socket.data.token = found?.token || defaultToken;
          socket.data.name = displayName;
        });
        attach(socket, found?.room, found?.role);
        if (found) {
          const p = found.room.game?.getPlayer(found.token);
          if (p) p.connected = found.role === 'player';
          if (found.role === 'player' && found.room.game?.buyWindow?.pendingDraw) found.room.game._maybeCloseBuyWindow();
          changed(found.room);
          emitAfter(socket, 'chat:history', found.room.chat.slice(-50));
        }
        return { ...(profile ? { profile: publicProfile(profile) } : {}), ...(found ? { rejoined: found.room.code } : roomCode && rejoin !== false ? { roomUnavailable: roomCode } : {}) };
      }, { hello: true })(data, ack);
    });
    socket.on('profile:get', guard(() => ({ profile: publicProfile(requireAccount()) }), { readOnly: true }));
    socket.on('profile:update', guard(({ displayName, avatarId, useGooglePhoto }) => {
      const profile = requireAccount();
      if (displayName !== undefined) {
        if (typeof displayName !== 'string' || !displayName.trim()) throw new Err('Enter a player name.');
        profile.displayName = displayName.trim().slice(0, 20);
      }
      if (avatarId !== undefined) {
        const avatar = normalizeAvatar(avatarId); if (!avatar) throw new Err('Choose a lake-house picture.');
        profile.avatarId = avatar;
      }
      if (useGooglePhoto !== undefined) profile.useGooglePhoto = useGooglePhoto === true && !!profile.photoUrl;
      for (const room of rooms.rooms.values()) {
        const membership = room.members[profile.id]; if (!membership) continue;
        const seat = room.seats.find((seat) => seat.token === membership.token);
        const player = room.game?.getPlayer(membership.token);
        if (seat) { seat.name = profile.displayName; seat.avatar = profile.avatarId; }
        if (player) { player.name = profile.displayName; player.avatar = profile.avatarId; }
        changed(room);
      }
      durable.afterCommit(() => { for (const peer of io.of('/').sockets.values()) if (peer.data.accountId === profile.id) peer.data.name = profile.displayName; });
      return { profile: publicProfile(profile) };
    }));
    socket.on('profile:claimLegacy', guard(({ token }) => {
      const profile = requireAccount();
      const result = rooms.claimLegacy(token, profile.id); if (result.error) throw new Err(result.error);
      return { ...result, profile: publicProfile(profile) };
    }));
    socket.on('rooms:list', guard(() => ({ rooms: rooms.list(socket.data.token, socket.data.accountId, allowLegacySessions).map((room) => ({ ...room, spectators: spectatorCount(rooms.get(room.code)) })) }), { readOnly: true }));
    const requestedCode = (code) => {
      const value = typeof code === 'string' ? code.trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{5}$/.test(value)) throw new Err('Enter the five-character game code.');
      return value;
    };
    socket.on('rooms:requestJoin', guard(({ code }) => {
      const profile = requireAccount();
      const room = rooms.get(requestedCode(code));
      if (!room) throw new Err('That game is not accepting requests.');
      const result = rooms.requestJoin(room, profile.id); if (result.error) throw new Err(result.error);
      changed(room);
      return result;
    }));
    socket.on('rooms:joinRequestStatus', guard(({ code }) => {
      const profile = requireAccount();
      const value = requestedCode(code);
      return { code: value, ...rooms.joinRequestStatus(rooms.get(value), profile.id) };
    }, { readOnly: true }));
    socket.on('rooms:create', guard(({ roomName, practice = false }) => {
      if (!allowLegacySessions && !practice) requireAccount();
      markAway(socket, { leave: true });
      const room = rooms.createRoom(String(roomName || '').slice(0, 30), user(), { practice: practice === true });
      durable.afterCommit(() => { socket.data.token = room.hostToken; });
      attach(socket, room, 'player');
      changed(room);
      return { code: room.code };
    }));
    socket.on('rooms:join', guard(({ code, spectate, inviteToken }) => {
      const room = rooms.get(typeof code === 'string' ? code : '');
      if (!room) throw new Err('This invitation or saved game is unavailable.');
      const membership = room.members[socket.data.accountId];
      const ownsPractice = room.visibility === 'practice' && room.hostToken === user().token && !Object.values(room.members).some((m) => m.token === user().token);
      if (!allowLegacySessions && !membership && !ownsPractice) {
        requireAccount();
        if (!rooms.validInvitation(room, inviteToken)) throw new Err('Use a current invitation from the host to join this private game.');
      }
      const joiningToken = membership?.token || user().token;
      const seated = room.seats.some((s) => s.token === joiningToken);
      let role;
      if (seated && !spectate) role = 'player';
      else if (spectate || room.game) role = 'spectator';
      else { const res = rooms.joinSeat(room, { ...user(), token: joiningToken }); if (res.error) throw new Err(res.error); role = 'player'; }
      markAway(socket, { leave: true });
      if (socket.data.accountId) {
        room.members[socket.data.accountId] = { token: joiningToken, role: seated ? 'player' : role };
        room.joinRequests = room.joinRequests.filter((request) => request.accountId !== socket.data.accountId);
      }
      durable.afterCommit(() => { socket.data.token = joiningToken; });
      if (role === 'spectator' && !room.spectators.includes(joiningToken)) room.spectators.push(joiningToken);
      if (role === 'player') room.spectators = room.spectators.filter((t) => t !== joiningToken);
      const p = room.game?.getPlayer(joiningToken);
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
      if (!canAccess(socket, room) || room.hostToken !== (room.members[socket.data.accountId]?.token || socket.data.token)) throw new Err('Only the host can close this game.');
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
    socket.on('room:approveJoin', guard(({ requestId }) => {
      requireAccount();
      const room = mustBeHost();
      const result = rooms.approveJoin(room, requestId); if (result.error) throw new Err(result.error);
      changed(room);
      return result;
    }));
    socket.on('room:denyJoin', guard(({ requestId }) => {
      requireAccount();
      const room = mustBeHost();
      const result = rooms.denyJoin(room, requestId); if (result.error) throw new Err(result.error);
      changed(room);
      return result;
    }));
    socket.on('room:invite', guard(({ rotate = false }) => {
      if (!allowLegacySessions) requireAccount();
      const room = mustBeHost();
      if (room.visibility === 'practice') throw new Err('Create a private game to invite family.');
      room.visibility = 'private';
      return { code: room.code, inviteToken: rooms.invitation(room, rotate === true) };
    }));
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
    const gameAction = (fn, decision = false) => guard((payload) => {
      const room = currentRoom();
      if (!room?.game) throw new Err('No game in progress.');
      if (socket.data.role !== 'player') throw new Err('Spectators cannot play.');
      if (!allowLegacySessions && decision) room.game.requireBuyDecision(payload.decisionId);
      fn(room.game, payload); changed(room);
    });
    socket.on('game:draw', gameAction((g, { from }) => {
      if (!['deck', 'discard'].includes(from)) throw new Err('Choose the deck or discard pile.');
      g.draw(socket.data.token, from);
    }, true));
    socket.on('game:buy', gameAction((g) => g.requestBuy(socket.data.token), true));
    socket.on('game:pass', gameAction((g) => g.passBuy(socket.data.token), true));
    socket.on('game:pauseBuy', gameAction((g) => g.pauseBuy(socket.data.token), true));
    socket.on('game:resumeBuy', gameAction((g) => g.resumeBuy(socket.data.token), true));
    socket.on('game:cancelBuy', gameAction((g) => g.cancelBuy(socket.data.token), true));
    socket.on('game:goDown', gameAction((g, { melds }) => g.goDown(socket.data.token, melds)));
    socket.on('game:layOff', gameAction((g, { meldId, cardId, end }) => g.layOff(socket.data.token, meldId, cardId, end)));
    socket.on('game:swapJoker', gameAction((g, { meldId, cardId }) => g.swapJoker(socket.data.token, meldId, cardId)));
    socket.on('game:discard', gameAction((g, { cardId }) => g.discard(socket.data.token, cardId)));
    socket.on('chat:send', guard(({ text }) => {
      const room = currentRoom(); if (!room) throw new Err('You are not in a room.');
      const msg = { from: socket.data.name, role: socket.data.role, text: String(text || '').slice(0, 300), at: Date.now() };
      if (!msg.text) return {};
      room.chat.push(msg); if (room.chat.length > 200) room.chat.shift(); changed(room);
      durable.afterCommit(() => {
        for (const peer of io.of('/').sockets.values()) {
          if (peer.data.roomCode === room.code && canAccess(peer, room)) peer.emit('chat:message', msg);
        }
      });
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
