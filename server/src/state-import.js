// Import without starting gameplay or altering the preserved source file.
// The injected store keeps full-snapshot verification testable without a database.
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { RoomManager } from './rooms.js';

const jsonCopy = (value) => JSON.parse(JSON.stringify(value));

export async function importPreservedState(source, store) {
  const rooms = new RoomManager();
  try {
    try {
      const snapshot = JSON.parse(fs.readFileSync(source, 'utf8'));
      if (!snapshot) throw new Error('Source snapshot is missing.');
      rooms.loadSnapshot(snapshot, () => {}, () => ({ resumeRuntime: false }));
    } catch {
      // Parser and validation errors can contain pieces of the private source.
      const error = new Error('The preserved source could not be read or validated. It has not been changed.');
      error.code = 'IMPORT_SOURCE_INVALID';
      throw error;
    }
    // Capture the exact JSON sent to Postgres once. This includes the migration's
    // generated IDs/defaults and excludes undefined fields just as JSONB does.
    const expected = jsonCopy(rooms.toSnapshot());
    if (await store.load()) throw new Error('Destination already has state. Import refused; nothing was overwritten.');
    await store.save(jsonCopy(expected));
    const verified = await store.load();
    if (!isDeepStrictEqual(verified, expected)) {
      const error = new Error('Import verification failed. The saved snapshot differs from the import. Inspect the destination before retrying; the source is unchanged.');
      error.code = 'IMPORT_VERIFY_MISMATCH';
      throw error;
    }
    return { roomCount: expected.rooms.length };
  } finally {
    for (const room of rooms.rooms.values()) room.game?.destroy();
  }
}
