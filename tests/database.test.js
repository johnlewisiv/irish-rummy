import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PostgresStateStore } from '../server/src/persistence.js';
import { RoomManager } from '../server/src/rooms.js';

// Run the production SQL against a local WASM build of PostgreSQL, including
// constraints and privileges. This does not claim to test Supabase networking.
test('Postgres schema protects and restores games and rejects stale writers', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'irish-rummy-postgres-'));
  let db;
  try {
    db = new PGlite(dir);
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    const migration = await readFile(new URL('../server/db/001-game-state.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Deployment may safely reapply it.
    for (const role of ['anon', 'authenticated']) {
      const permission = await db.query(`SELECT
        has_schema_privilege($1, 'irish_rummy_private', 'USAGE') AS schema_access,
        has_table_privilege($1, 'irish_rummy_private.game_state', 'SELECT') AS read_access,
        has_table_privilege($1, 'irish_rummy_private.game_state', 'UPDATE') AS write_access`, [role]);
      assert.deepEqual(permission.rows[0], {schema_access: false, read_access: false, write_access: false});
    }
    const rls = await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'irish_rummy_private.game_state'::regclass");
    assert.equal(rls.rows[0].relrowsecurity, true);
    for (const snapshot of [{}, {version: 1}, {version: 99, rooms: []}, {version: null, rooms: []}, {version: '1', rooms: []}, {version: 1, rooms: {}}]) {
      await assert.rejects(db.query('INSERT INTO irish_rummy_private.game_state VALUES ($1, 1, $2, now())',
        ['invalid', JSON.stringify(snapshot)]), /check constraint/);
    }

    const manager = new RoomManager();
    const room = manager.createRoom('Restart proof', {token: 'private-alice', name: 'Alice'});
    manager.joinSeat(room, {token: 'private-bob', name: 'Bob'});
    room.buyWindowMs = 0;
    manager.startGame(room, () => {});
    room.game.suspendRuntime?.();
    room.chat.push({from: 'Alice', text: 'Continue tomorrow', at: Date.now()});
    const original = manager.toSnapshot();
    const makeStore = () => new PostgresStateStore({pool: {query: (query, args) => db.query(query, args)}});
    const first = makeStore();
    const stale = makeStore();
    assert.equal(await first.load(), null);
    assert.equal(await stale.load(), null);
    await first.save(original);
    await assert.rejects(stale.save(original), {code: 'STATE_CONFLICT'});
    assert.deepEqual(await stale.load(), original);
    const changed = structuredClone(original);
    changed.rooms[0].name = 'Still here tomorrow';
    await stale.save(changed);
    await assert.rejects(first.save(original), {code: 'STATE_CONFLICT'});

    await db.close();
    db = new PGlite(dir);
    const recovered = await makeStore().load();
    assert.deepEqual(recovered, changed, 'whole room, hands, scores, buy window and chat survive database closure');
    const restored = new RoomManager();
    restored.loadSnapshot(recovered, () => {}, () => ({resumeRuntime: false}));
    restored.get(room.code).game.assertDeckIntegrity();
    assert.equal(restored.get(room.code).chat[0].text, 'Continue tomorrow');
    room.game.destroy();
    restored.get(room.code).game.destroy();
  } finally {
    await db?.close();
    await rm(dir, {recursive: true, force: true});
  }
});
