// rooms.js — in-memory lobby/room management.
// A "room" holds up to 6 seats (humans + bots), any number of spectators,
// a chat log, and (once started) a Game instance.

import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { Game } from './game.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const MAX_JOIN_REQUESTS = 32;
let botSeq = 0;

function clonePlain(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return JSON.parse(JSON.stringify(value));
}

function syncBotSeq(room) {
  for (const seat of room.seats || []) {
    const n = /^bot-(\d+)$/.exec(seat.token || '')?.[1];
    if (n !== undefined) botSeq = Math.max(botSeq, Number(n) + 1);
  }
}

export const BOT_NAMES = {
  easy: 'Riley',
  medium: 'Morgan',
  hard: 'Casey',
  extreme: 'Jordan',
};
export const LEGACY_AVATARS = [
  'avatar-loon.png', 'avatar-fox.png', 'avatar-chipmunk.png',
  'avatar-bear.png', 'avatar-mallard.png', 'avatar-trout.png',
];

export const AVATARS = ['lake-canoe', 'lake-dock', 'lake-cabin', 'lake-lantern', 'lake-sailboat', 'lake-coffee'];
export const normalizeAvatar = (id) => AVATARS.includes(id) ? id : AVATARS[LEGACY_AVATARS.indexOf(id)] || null;

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> room
    this.accounts = new Map();
  }

  toSnapshot() {
    return {
      version: 3,
      accounts: [...this.accounts.values()],
      savedAt: new Date().toISOString(),
      rooms: [...this.rooms.values()].map((room) => ({
        code: room.code,
        name: room.name,
        hostToken: room.hostToken,
        visibility: room.visibility,
        members: room.members,
        inviteToken: room.inviteToken,
        joinRequests: room.joinRequests,
        seats: room.seats,
        spectators: room.spectators,
        chat: room.chat,
        buyWindowMs: room.buyWindowMs,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        game: room.game ? room.game.toSnapshot() : null,
      })),
    };
  }

  loadSnapshot(snapshot, onGameChange = () => {}, gameOptions = () => ({})) {
    if (snapshot === null || snapshot === undefined) return 0;
    if (![1, 2, 3].includes(snapshot.version) || !Array.isArray(snapshot.rooms)) throw new Error('Invalid or unsupported room snapshot.');
    const restored = new Map();
    const accounts = new Map((snapshot.accounts || []).map((account) => [account.id, clonePlain(account)]));
    if (accounts.size !== (snapshot.accounts || []).length || [...accounts.values()].some((a) => !a.id || !a.displayName)) throw new Error('Invalid saved accounts.');
    for (const raw of snapshot.rooms) {
      if (!raw?.code || !Array.isArray(raw.seats) || !raw.seats.length || raw.seats.length > 6) throw new Error('Invalid room snapshot.');
      if (raw.seats.some((s) => !s.token || typeof s.token !== 'string') || new Set(raw.seats.map((s) => s.token)).size !== raw.seats.length) throw new Error('Invalid saved seats.');
      const room = {
        code: String(raw.code).toUpperCase(),
        name: raw.name || 'Irish Rummy room',
        hostToken: raw.hostToken,
        visibility: raw.visibility || 'legacy',
        members: clonePlain(raw.members, {}),
        inviteToken: raw.inviteToken || null,
        joinRequests: clonePlain(raw.joinRequests, []),
        seats: clonePlain(raw.seats, []).map((s) => ({ ...s, id: s.id || randomUUID(), avatar: normalizeAvatar(s.avatar), ...(s.isBot ? { name: BOT_NAMES[s.difficulty] || 'Morgan' } : {}) })),
        spectators: clonePlain(raw.spectators, []),
        chat: clonePlain(raw.chat, []).slice(-200),
        game: null,
        buyWindowMs: raw.buyWindowMs !== undefined
          ? Number(raw.buyWindowMs)
          : Number(process.env.BUY_WINDOW_MS ?? 8000),
        createdAt: raw.createdAt || Date.now(),
        updatedAt: raw.updatedAt || raw.createdAt || Date.now(),
      };
      if (!Array.isArray(room.joinRequests) || room.joinRequests.length > MAX_JOIN_REQUESTS
        || room.joinRequests.some((request) => !request || typeof request.requestId !== 'string' || !request.requestId || request.requestId.length > 128
          || typeof request.accountId !== 'string' || !accounts.has(request.accountId) || !Number.isFinite(request.createdAt))
        || new Set(room.joinRequests.map((request) => request.requestId)).size !== room.joinRequests.length
        || new Set(room.joinRequests.map((request) => request.accountId)).size !== room.joinRequests.length) throw new Error('Invalid saved join requests.');
      if (!room.hostToken && room.seats[0]) room.hostToken = room.seats[0].token;
      if (!room.seats.some((s) => s.token === room.hostToken) || room.seats.some((s) => typeof s.id !== 'string')
        || new Set(room.seats.map((s) => s.id)).size !== room.seats.length) throw new Error('Invalid saved room identity.');
      const botCounts = new Map();
      for (const seat of room.seats.filter((seat) => seat.isBot)) {
        const base = BOT_NAMES[seat.difficulty] || 'Morgan';
        const count = (botCounts.get(base) || 0) + 1; botCounts.set(base, count);
        seat.name = count === 1 ? base : `${base} ${count}`;
      }
      if (raw.game) room.game = Game.fromSnapshot(raw.game, () => onGameChange(room), { buyWindowMs: room.buyWindowMs, ...gameOptions(room) });
      if (room.game) for (const seat of room.seats) { const player = room.game.getPlayer(seat.token); if (player) { player.avatar = seat.avatar; if (seat.isBot) player.name = seat.name; } }
      syncBotSeq(room);
      if (restored.has(room.code)) throw new Error('Duplicate saved room code.');
      if (room.game && (room.game.players.length !== room.seats.length || room.game.players.some((p) => !room.seats.some((s) => s.token === p.id)))) throw new Error('Saved game seats do not match room seats.');
      restored.set(room.code, room);
    }
    for (const room of this.rooms.values()) room.game?.destroy();
    this.rooms = restored;
    this.accounts = accounts;
    return this.rooms.size;
  }

  createRoom(name, host, { practice = false } = {}) {
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    const room = {
      code,
      name: name || `${host.name}'s game`,
      hostToken: host.token,
      visibility: practice ? 'practice' : 'private',
      members: host.accountId ? { [host.accountId]: { token: host.token, role: 'player' } } : {},
      inviteToken: null,
      joinRequests: [],
      seats: [{ id: randomUUID(), token: host.token, name: host.name, isBot: false, avatar: host.avatar || null }],
      spectators: [], // tokens
      chat: [],
      game: null,
      // room setting: 0 = casual (no countdown); default from env for ops
      buyWindowMs: Number(process.env.BUY_WINDOW_MS ?? 30000),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  get(code) { return this.rooms.get((code || '').toUpperCase()); }

  /** A signed-in account sees only its own tables. */
  list(viewerToken = null, accountId = null, legacyTest = false) {
    return [...this.rooms.values()].filter((r) => legacyTest || (accountId ? !!r.members[accountId] : r.visibility === 'practice' && !Object.values(r.members).some((m) => m.token === viewerToken) && r.seats.some((s) => s.token === viewerToken))).map((r) => ({
      code: r.code,
      name: r.name,
      players: r.seats.map((s) => s.name),
      members: r.seats.map((seat) => {
        const accountId = Object.entries(r.members).find(([, member]) => member.token === seat.token)?.[0];
        const profile = this.accounts.get(accountId);
        return { name: seat.name, avatarId: seat.avatar, isBot: seat.isBot, ...(profile?.useGooglePhoto && profile.photoUrl ? { photoUrl: profile.photoUrl } : {}) };
      }),
      role: r.members[accountId]?.role || 'player',
      yourTurn: !!r.game && r.game.phase === 'playing' && r.game.currentPlayer().id === (r.members[accountId]?.token || viewerToken),
      started: !!r.game,
      phase: r.game ? r.game.phase : 'lobby',
      round: r.game ? r.game.round : 0,
      spectators: r.spectators.length,
      visibility: r.visibility,
      updatedAt: r.updatedAt,
      canClose: r.hostToken === (r.members[accountId]?.token || viewerToken),
      canRejoin: !!r.members[accountId] || (!!viewerToken && r.seats.some((s) => s.token === viewerToken)),
    }));
  }

  joinSeat(room, user) {
    if (room.game) return { error: 'Game already started — you can spectate.' };
    if (room.seats.length >= 6) return { error: 'Room is full (6 players max).' };
    if (room.seats.some((s) => s.token === user.token)) return {};
    room.seats.push({ id: randomUUID(), token: user.token, name: user.name, isBot: false, avatar: user.avatar || null });
    return {};
  }

  requestJoin(room, accountId) {
    if (room.members[accountId]) return { member: true, code: room.code };
    if (room.visibility !== 'private') return { error: 'This table does not accept game-code requests.' };
    if (room.game) return { error: 'This game has already started. Ask the host for an invitation to watch.' };
    if (room.joinRequests.some((request) => request.accountId === accountId)) return { pending: true, code: room.code };
    if (room.seats.length >= 6) return { error: 'This table is full.' };
    if (room.joinRequests.length >= MAX_JOIN_REQUESTS) return { error: 'The host needs to review the existing requests before accepting more.' };
    if (!this.accounts.has(accountId)) return { error: 'Sign in before requesting a seat.' };
    room.joinRequests.push({ requestId: randomUUID(), accountId, createdAt: Date.now() });
    return { pending: true, code: room.code };
  }

  joinRequestStatus(room, accountId) {
    if (room?.members[accountId]) return { member: true };
    return { pending: !!room && room.visibility === 'private' && !room.game
      && room.joinRequests.some((request) => request.accountId === accountId) };
  }

  approveJoin(room, requestId) {
    const request = room.joinRequests.find((item) => item.requestId === requestId);
    if (!request) return { error: 'That request has already ended.' };
    if (room.visibility !== 'private' || room.game) return { error: 'This table is no longer accepting players.' };
    const profile = this.accounts.get(request.accountId);
    if (!profile) return { error: 'That player needs to sign in again.' };
    const token = room.members[profile.id]?.token || `account:${profile.id}`;
    if (!room.seats.some((seat) => seat.token === token)) {
      const result = this.joinSeat(room, { token, name: profile.displayName, avatar: profile.avatarId });
      if (result.error) return result;
    }
    room.members[profile.id] = { token, role: 'player' };
    room.spectators = room.spectators.filter((spectator) => spectator !== token);
    room.joinRequests = room.joinRequests.filter((item) => item.requestId !== requestId);
    return { approved: true, code: room.code };
  }

  denyJoin(room, requestId) {
    if (!room.joinRequests.some((request) => request.requestId === requestId)) return { error: 'That request has already ended.' };
    room.joinRequests = room.joinRequests.filter((request) => request.requestId !== requestId);
    return { denied: true, code: room.code };
  }

  claimLegacy(token, accountId) {
    if (typeof token !== 'string' || token.length < 16 || token.length > 256) return { error: 'Invalid saved player proof.' };
    const matching = [...this.rooms.values()].filter((r) => r.seats.some((s) => !s.isBot && s.token === token) || r.spectators.includes(token));
    if (matching.some((r) => Object.entries(r.members).some(([id, member]) => id !== accountId && member.token === token))) return { error: 'This saved player already belongs to another account.' };
    if (matching.some((r) => r.members[accountId] && r.members[accountId].token !== token)) return { error: 'Your account already has a different seat at one of these tables.' };
    for (const room of matching) {
      room.members[accountId] = { token, role: room.seats.some((s) => s.token === token) ? 'player' : 'spectator' };
      room.joinRequests = room.joinRequests.filter((request) => request.accountId !== accountId);
      if (room.visibility === 'legacy') room.visibility = 'private';
    }
    return { claimed: matching.length };
  }

  invitation(room, rotate = false) {
    if (rotate || !room.inviteToken) room.inviteToken = randomBytes(32).toString('base64url');
    return room.inviteToken;
  }

  validInvitation(room, token) {
    if (room.visibility !== 'private' || typeof token !== 'string' || !room.inviteToken || Buffer.byteLength(token) !== Buffer.byteLength(room.inviteToken)) return false;
    return timingSafeEqual(Buffer.from(token), Buffer.from(room.inviteToken));
  }

  /** First avatar nobody at the table is using yet. */
  freeAvatar(room) {
    const taken = new Set(room.seats.map((s) => s.avatar).filter(Boolean));
    return AVATARS.find((a) => !taken.has(a)) || AVATARS[botSeq % AVATARS.length];
  }

  addBot(room, difficulty) {
    if (room.game) return { error: 'Game already started.' };
    if (room.seats.length >= 6) return { error: 'Room is full.' };
    const base = BOT_NAMES[difficulty] || 'Bot';
    const count = room.seats.filter((s) => s.isBot && s.name.startsWith(base)).length;
    room.seats.push({
      id: randomUUID(),
      token: `bot-${botSeq++}`,
      name: count ? `${base} ${count + 1}` : base,
      isBot: true,
      difficulty: difficulty || 'medium',
      avatar: this.freeAvatar(room), // bots auto-pick a free portrait
    });
    return {};
  }

  setAvatar(room, token, avatar) {
    avatar = normalizeAvatar(avatar);
    if (!avatar) return { error: 'Unknown avatar.' };
    const seat = room.seats.find((s) => s.token === token);
    if (!seat) return { error: 'Not seated in this room.' };
    seat.avatar = avatar;
    // Mid-game too — the table updates live.
    const player = room.game?.getPlayer(token);
    if (player) player.avatar = avatar;
    return {};
  }

  removeSeat(room, token) {
    room.seats = room.seats.filter((s) => s.token !== token);
  }

  startGame(room, onChange, opts = {}) {
    if (room.game) return { error: 'Already started.' };
    if (room.seats.length < 2) return { error: 'Need at least 2 players (add a bot to play solo).' };
    // Give any undecided humans a free portrait before the deal.
    for (const s of room.seats) if (!s.avatar) s.avatar = this.freeAvatar(room);
    room.game = new Game(
      room.seats.map((s) => ({
        id: s.token, name: s.name, isBot: s.isBot, difficulty: s.difficulty, avatar: s.avatar,
      })),
      onChange,
      { buyWindowMs: room.buyWindowMs, ...opts },
    );
    room.game.startNextRound();
    room.joinRequests = [];
    return {};
  }

  /** Find the room (if any) where this token is seated or spectating. */
  findByToken(token) {
    for (const room of this.rooms.values()) {
      if (room.seats.some((s) => s.token === token)) return { room, role: 'player' };
      if (room.spectators.includes(token)) return { room, role: 'spectator' };
    }
    return null;
  }

  destroyRoom(code) {
    const room = this.rooms.get(code);
    if (room?.game) room.game.destroy();
    this.rooms.delete(code);
  }

  /** Family tables are kept until their host explicitly closes them. */
  sweep() { return false; }
}
