// Maintenance-only import. Never starts a server, overwrites a row, or deletes source.
import { JsonStateStore, PostgresStateStore } from '../src/persistence.js';
import { RoomManager } from '../src/rooms.js';
import fs from 'node:fs';

const source = process.argv[2];
const connectionString = process.env.IRISH_RUMMY_DATABASE_URL || process.env.DATABASE_URL;
if (!source || !connectionString) {
  console.error('Usage: IRISH_RUMMY_DATABASE_URL=<server secret> node server/scripts/import-state.js /path/to/preserved-rooms.json');
  process.exitCode = 1;
} else {
  let store;
  try {
    const snapshot = new JsonStateStore(source).load();
    if (!snapshot) throw new Error('Source snapshot is missing.');
    const rooms = new RoomManager();
    rooms.loadSnapshot(snapshot, () => {}, () => ({ resumeRuntime: false }));
    store = new PostgresStateStore({ connectionString, stateKey: process.env.IRISH_RUMMY_STATE_KEY || 'family-games',
      ca: process.env.IRISH_RUMMY_DATABASE_CA_FILE ? fs.readFileSync(process.env.IRISH_RUMMY_DATABASE_CA_FILE, 'utf8') : undefined });
    if (await store.load()) throw new Error('Destination already has state. Import refused; nothing was overwritten.');
    await store.save(rooms.toSnapshot());
    const verified = await store.load();
    if (verified.rooms.length !== rooms.rooms.size) throw new Error('Import verification failed.');
    console.log(`Imported and verified ${verified.rooms.length} rooms. Source file is unchanged.`);
  } catch (error) {
    // Do not print pg error payloads, URLs, or credentials.
    console.error(error.code ? `Import failed (${error.code}). Existing source is unchanged.` : error.message);
    process.exitCode = 1;
  } finally { await store?.close(); }
}
