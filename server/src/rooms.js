// rooms.js — in-memory lobby/room management.
// A "room" holds up to 6 seats (humans + bots), any number of spectators,
// a chat log, and (once started) a Game instance.

import { Game } from './game.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let botSeq = 0;

export const BOT_NAMES = {
  easy: 'Pippin',
  medium: 'Tom Bombadil',
  hard: 'Saruman',
  extreme: 'Peggy', // she learned from nuns — she mostly wins
};
export const AVATARS = [
  'avatar-loon.png', 'avatar-fox.png', 'avatar-chipmunk.png',
  'avatar-bear.png', 'avatar-mallard.png', 'avatar-trout.png',
];

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> room
  }

  createRoom(name, host) {
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    const room = {
      code,
      name: name || `${host.name}'s game`,
      hostToken: host.token,
      seats: [{ token: host.token, name: host.name, isBot: false, avatar: null }],
      spectators: [], // tokens
      chat: [],
      game: null,
      // room setting: 0 = casual (no countdown); default from env for ops
      buyWindowMs: Number(process.env.BUY_WINDOW_MS ?? 8000),
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  get(code) { return this.rooms.get((code || '').toUpperCase()); }

  /** Public lobby listing (a few public games — no need to hide them). */
  list() {
    return [...this.rooms.values()].map((r) => ({
      code: r.code,
      name: r.name,
      players: r.seats.map((s) => s.name),
      started: !!r.game,
      phase: r.game ? r.game.phase : 'lobby',
      round: r.game ? r.game.round : 0,
      spectators: r.spectators.length,
    }));
  }

  joinSeat(room, user) {
    if (room.game) return { error: 'Game already started — you can spectate.' };
    if (room.seats.length >= 6) return { error: 'Room is full (6 players max).' };
    if (room.seats.some((s) => s.token === user.token)) return {};
    room.seats.push({ token: user.token, name: user.name, isBot: false, avatar: null });
    return {};
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
      token: `bot-${botSeq++}`,
      name: count ? `${base} ${count + 1}` : base,
      isBot: true,
      difficulty: difficulty || 'medium',
      avatar: this.freeAvatar(room), // bots auto-pick a free portrait
    });
    return {};
  }

  setAvatar(room, token, avatar) {
    if (!AVATARS.includes(avatar)) return { error: 'Unknown avatar.' };
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

  startGame(room, onChange) {
    if (room.game) return { error: 'Already started.' };
    if (room.seats.length < 2) return { error: 'Need at least 2 players (add a bot to play solo).' };
    // Give any undecided humans a free portrait before the deal.
    for (const s of room.seats) if (!s.avatar) s.avatar = this.freeAvatar(room);
    room.game = new Game(
      room.seats.map((s) => ({
        id: s.token, name: s.name, isBot: s.isBot, difficulty: s.difficulty, avatar: s.avatar,
      })),
      onChange,
      { buyWindowMs: room.buyWindowMs },
    );
    room.game.startNextRound();
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

  /** Drop stale finished/abandoned rooms (called periodically). */
  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const dead = room.game?.phase === 'gameOver' && now - room.createdAt > 60 * 60 * 1000;
      const abandoned = !room.game && now - room.createdAt > 12 * 60 * 60 * 1000;
      if (dead || abandoned) this.destroyRoom(code);
    }
  }
}
