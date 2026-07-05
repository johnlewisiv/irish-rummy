// persistence.js — tiny disk-backed room snapshots.
// Render preserves files only under the persistent disk mount path, so keep
// all mutable game state in one atomic JSON file there.

import fs from 'fs';
import path from 'path';

export function defaultStateFile() {
  if (process.env.ROOM_STATE_FILE) return process.env.ROOM_STATE_FILE;
  if (process.env.IRISH_RUMMY_STATE_FILE) return process.env.IRISH_RUMMY_STATE_FILE;
  return fs.existsSync('/var/data') ? '/var/data/irish-rummy-state.json' : null;
}

export class JsonStateStore {
  constructor(file = defaultStateFile()) {
    this.file = file;
    this.enabled = !!file;
    this.lastSaveError = null;
  }

  load() {
    if (!this.enabled || !fs.existsSync(this.file)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (e) {
      console.error(`Could not load room state from ${this.file}:`, e);
      return null;
    }
  }

  save(snapshot) {
    if (!this.enabled) return false;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
      fs.renameSync(tmp, this.file);
      this.lastSaveError = null;
      return true;
    } catch (e) {
      if (this.lastSaveError !== e.message) {
        console.error(`Could not save room state to ${this.file}:`, e);
        this.lastSaveError = e.message;
      }
      return false;
    }
  }
}
