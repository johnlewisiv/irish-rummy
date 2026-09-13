// Maintenance-only import. Never starts a server, overwrites a row, or deletes source.
import { PostgresStateStore } from '../src/persistence.js';
import { importPreservedState } from '../src/state-import.js';
import fs from 'node:fs';

const source = process.argv[2];
const connectionString = process.env.IRISH_RUMMY_DATABASE_URL || process.env.DATABASE_URL;
if (!source || !connectionString) {
  console.error('Usage: IRISH_RUMMY_DATABASE_URL=<server secret> node server/scripts/import-state.js /path/to/preserved-rooms.json');
  process.exitCode = 1;
} else {
  let store;
  try {
    store = new PostgresStateStore({ connectionString, stateKey: process.env.IRISH_RUMMY_STATE_KEY || 'family-games',
      ca: process.env.IRISH_RUMMY_DATABASE_CA_FILE ? fs.readFileSync(process.env.IRISH_RUMMY_DATABASE_CA_FILE, 'utf8') : undefined });
    const { roomCount } = await importPreservedState(source, store);
    console.log(`Imported ${roomCount} rooms and verified the complete saved snapshot. Source file is unchanged.`);
  } catch (error) {
    // Do not print pg error payloads, URLs, or credentials.
    console.error(error.code ? `Import failed (${error.code}). Existing source is unchanged.` : error.message);
    process.exitCode = 1;
  } finally { await store?.close(); }
}
