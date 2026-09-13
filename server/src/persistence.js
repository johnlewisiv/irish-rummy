// Persistence is server-only. Failed reads or writes must never become new games.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export function defaultStateFile() {
  return process.env.ROOM_STATE_FILE || process.env.IRISH_RUMMY_STATE_FILE
    || (fs.existsSync('/var/data') ? '/var/data/irish-rummy-state.json'
      : fileURLToPath(new URL('../.data/rooms.json', import.meta.url)));
}

export class JsonStateStore {
  constructor(file = defaultStateFile()) {
    this.file = file;
    this.enabled = !!file;
    this.kind = file ? 'file' : 'memory';
  }
  load() {
    if (!this.enabled) return null;
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  save(snapshot) {
    if (!this.enabled) throw new Error('No persistent state file configured.');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    let fd;
    try {
      fd = fs.openSync(tmp, 'w', 0o600);
      fs.writeFileSync(fd, JSON.stringify(snapshot));
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tmp, this.file);
      const directory = fs.openSync(path.dirname(this.file), 'r');
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
      return true;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  async close() {}
}

export class PostgresStateStore {
  constructor({ connectionString, pool, stateKey = 'family-games', ca, legacyFile } = {}) {
    this.enabled = true;
    this.kind = 'postgres';
    this.stateKey = stateKey;
    this.revision = null;
    this.legacyFile = legacyFile;
    if (!pool) {
      const url = new URL(connectionString);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      // URL SSL parameters override pg's ssl object. Always verify remote TLS.
      for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
      pool = new pg.Pool({
        connectionString: url.toString(), max: 2, connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000, statement_timeout: 5000,
        ssl: local ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
      });
    }
    this.pool = pool;
    this.pool.on?.('error', () => {});
  }
  async load() {
    const result = await this.pool.query(
      'SELECT revision, snapshot FROM irish_rummy_private.game_state WHERE state_key = $1', [this.stateKey]);
    const row = result.rows[0];
    if (!row && this.legacyFile && fs.existsSync(this.legacyFile)) {
      const legacy = new JsonStateStore(this.legacyFile).load();
      if (!legacy || !Array.isArray(legacy.rooms) || legacy.rooms.length) {
        const error = new Error('Existing disk rooms must be imported before starting with an empty database.');
        error.code = 'MIGRATION_REQUIRED';
        throw error;
      }
    }
    this.revision = row ? String(row.revision) : '0';
    return row?.snapshot ?? null;
  }
  async save(snapshot) {
    if (this.revision === null) throw new Error('Load database state before saving.');
    // One guarded statement commits the full room set, preventing stale writers
    // from replacing newer state during an overlapping deployment.
    const result = this.revision === '0'
      ? await this.pool.query(`
          INSERT INTO irish_rummy_private.game_state (state_key, revision, snapshot)
          VALUES ($1, 1, $2::jsonb) ON CONFLICT (state_key) DO NOTHING RETURNING revision`,
        [this.stateKey, JSON.stringify(snapshot)])
      : await this.pool.query(`
          UPDATE irish_rummy_private.game_state
          SET snapshot = $2::jsonb, revision = revision + 1, updated_at = now()
          WHERE state_key = $1 AND revision = $3::bigint RETURNING revision`,
        [this.stateKey, JSON.stringify(snapshot), this.revision]);
    if (!result.rows.length) {
      const error = new Error('Database state changed in another server. Stop duplicate instances and restart.');
      error.code = 'STATE_CONFLICT';
      throw error;
    }
    this.revision = String(result.rows[0].revision);
    return true;
  }
  async close() { await this.pool.end(); }
}

export function createStateStore(env = process.env) {
  const connectionString = env.IRISH_RUMMY_DATABASE_URL || env.DATABASE_URL;
  if (connectionString) return new PostgresStateStore({
    connectionString, stateKey: env.IRISH_RUMMY_STATE_KEY || 'family-games',
    legacyFile: env.ROOM_STATE_FILE || env.IRISH_RUMMY_STATE_FILE || (fs.existsSync('/var/data') ? '/var/data/irish-rummy-state.json' : undefined),
    ca: env.IRISH_RUMMY_DATABASE_CA_FILE ? fs.readFileSync(env.IRISH_RUMMY_DATABASE_CA_FILE, 'utf8') : undefined,
  });
  if (env.NODE_ENV === 'production' && !env.ROOM_STATE_FILE && !env.IRISH_RUMMY_STATE_FILE && !fs.existsSync('/var/data')) {
    throw new Error('Production requires IRISH_RUMMY_DATABASE_URL or a persistent ROOM_STATE_FILE.');
  }
  return new JsonStateStore();
}
