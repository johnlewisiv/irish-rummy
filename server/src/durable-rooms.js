import { RoomManager } from './rooms.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
export class SavingUnavailable extends Error {
  constructor() {
    super('Game saving is temporarily unavailable. Please wait for reconnection before playing again.');
    this.playerFacing = true;
    this.retryable = true;
  }
}

// Every socket action and autonomous timer enters this queue. No callback may
// expose a mutation to clients until its complete snapshot has been committed.
export class DurableRooms {
  constructor(store, { onCommit = () => {}, onStatus = () => {}, getPresence = () => new Map() } = {}) {
    this.store = store;
    this.rooms = new RoomManager();
    this.onCommit = onCommit;
    this.onStatus = onStatus;
    this.getPresence = getPresence;
    this.tail = Promise.resolve();
    this.paused = false;
    this.conflict = false;
    this.closed = false;
    this.effects = [];
  }
  gameOptions(room) {
    return { resumeRuntime: false, runMutation: (fn) => {
      this.run(() => { if (this.rooms.get(room.code) === room) fn(); })
        .catch(() => {}); // run() already pauses and reports persistence failures
    } };
  }
  hydrate(snapshot, presence = new Map()) {
    this.rooms.loadSnapshot(snapshot, (room) => { room.updatedAt = Date.now(); }, (room) => this.gameOptions(room));
    for (const room of this.rooms.rooms.values()) {
      for (const player of room.game?.players || []) {
        player.connected = player.isBot || !!presence.get(room.code)?.has(player.id);
      }
    }
  }
  async initialize() {
    const snapshot = await this.store.load();
    this.hydrate(snapshot);
    // Persist schema upgrades / seat public IDs before clients can connect.
    await this.store.save(copy(this.rooms.toSnapshot()));
    return this.rooms.rooms.size;
  }
  status() { return { persistence: this.store.kind, state: this.paused ? 'paused' : 'ready' }; }
  afterCommit(fn) { this.effects.push(fn); }
  refreshRuntime() {
    for (const room of this.rooms.rooms.values()) {
      if (!room.game) continue;
      if (this.paused || !room.game.players.some((p) => !p.isBot && p.connected)) room.game.suspendRuntime();
      else room.game.resumeRuntime();
    }
  }
  run(fn, { readOnly = false } = {}) {
    const task = this.tail.then(async () => {
      if (this.closed || (this.paused && !readOnly)) throw new SavingUnavailable();
      if (readOnly) return fn();
      const before = copy(this.rooms.toSnapshot());
      const presence = new Map([...this.rooms.rooms.values()].map((room) => [room.code,
        new Set((room.game?.players || []).filter((p) => p.connected).map((p) => p.id))]));
      this.effects = [];
      let result;
      try {
        result = fn();
        if (result?.then) throw new Error('Durable mutations must be synchronous.');
        this.refreshRuntime();
        for (const room of this.rooms.rooms.values()) {
          if (room.game && room.game.phase !== 'idle') room.game.assertDeckIntegrity();
        }
      } catch (error) {
        this.hydrate(before, presence);
        this.refreshRuntime();
        this.effects = [];
        throw error;
      }
      try {
        const saved = await this.store.save(copy(this.rooms.toSnapshot()));
        if (saved === false) throw new Error('State store rejected the save.');
      } catch (error) {
        this.paused = true;
        this.conflict = error.code === 'STATE_CONFLICT';
        this.hydrate(before, presence);
        this.refreshRuntime();
        this.effects = [];
        // Do not log snapshots, bearer tokens, connection strings or SQL params.
        console.error(`Game persistence paused (${error.code || error.name || 'save failure'}).`);
        this.onStatus(this.status());
        throw new SavingUnavailable();
      }
      const effects = this.effects;
      this.effects = [];
      for (const effect of effects) effect();
      this.onCommit();
      return result;
    });
    this.tail = task.catch(() => {});
    return task;
  }
  recover() {
    const task = this.tail.then(async () => {
      if (!this.paused || this.conflict || this.closed) return false;
      // The failed request may have reached Postgres before the connection broke.
      // Reload the authority; never replay or overwrite with our rollback copy.
      const snapshot = await this.store.load();
      if (!snapshot) throw new Error('Previously saved state is missing.');
      this.hydrate(snapshot, this.getPresence());
      await this.store.save(copy(this.rooms.toSnapshot()));
      this.paused = false;
      this.refreshRuntime();
      this.onCommit();
      this.onStatus(this.status());
      return true;
    });
    this.tail = task.catch(() => {});
    return task;
  }
  async close() {
    this.closed = true;
    await this.tail;
    for (const room of this.rooms.rooms.values()) room.game?.suspendRuntime();
    await this.store.close?.();
  }
}
