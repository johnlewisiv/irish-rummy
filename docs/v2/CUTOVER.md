# Irish Rummy v2 cutover

This is an operator runbook. No live game import, hosting cutover, or rollback was performed while writing it.

## Verified starting point

On September 13, 2026, the coordinator verified a TLS connection to the dedicated Irish Rummy Supabase project (`djsgajbcrydzcbktzemc`), applied `server/db/002-account-state.sql`, and confirmed that the private table accepts version 3. The database still contained **zero saved snapshots**. No `family-games` row had been created. Recheck this immediately before importing; it is a point-in-time observation.

The reviewed app writes snapshot version 3, which includes accounts, memberships and invitations. The deployed old binary and its exact pre-v2 snapshot must be preserved together. Merely starting v2 rewrites its configured store as version 3, including when that store is still the Render disk.

Live Render inspection subsequently verified service `srv-d953gfu7r5hc73dvnnbg` (Ohio), tracked branch `main`, deployed SHA `707d0de679a7989557a883161d7911d111283d31`, $7/month existing compute and a 1 GB disk at `/var/data`. No live settings were changed. Recheck the revision and state at the actual freeze.

## 1. Prepare and freeze the old writer

1. Record the actual Render service, deployed Git SHA/branch, canonical hostname, current state-file path, persistent disk attachment and instance count. The repository's intended disk is `/var/data`, with `ROOM_STATE_FILE=/var/data/irish-rummy-state.json`; verify the live values.
2. Keep one game-server instance. Temporarily disable automatic deployment and any blueprint synchronization that could launch an app process during maintenance. Do this before pushing/deploying a v2 revision to the service's tracked branch.
3. Set the deployment runtime to Node 22. The pinned Supabase client packages require Node >=22; `render.yaml` and the root package manifests now match that requirement. Build/test the exact release revision before opening production traffic.
4. Verify Google sign-in and its exact production redirect before requiring it for existing family games. Render also needs `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`; the Google secret belongs only in the provider configuration.
5. Use a verified Render maintenance/stop route that leaves the persistent disk and an approved shell available. The repository does not currently supply a maintenance mode. A temporary maintenance server must not import/start the game server. Confirm the old process and its socket connections have stopped; no old bot, timer or player action may write while the snapshot is copied or imported. A page banner alone does not freeze gameplay.

Do not start v2 against the live disk as an intermediate step. `DurableRooms.initialize()` immediately saves the normalized version 3 snapshot.

## 2. Preserve the final disk snapshot

Run from the maintenance environment only after the old writer is stopped. This creates an exclusive backup with private permissions, verifies the bytes and unchanged source, then reports only the filename, version, count and checksum. If validation fails, the copied bytes remain preserved and the import must stop.

```sh
umask 077
node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
let backup = null;
try {
  const source = process.env.ROOM_STATE_FILE || process.env.IRISH_RUMMY_STATE_FILE || '/var/data/irish-rummy-state.json';
  if (!source.startsWith('/var/data/')) throw new Error('Verify the configured persistent mount before copying.');
  const bytes = fs.readFileSync(source);
  backup = `${source}.pre-v2-${randomUUID()}.json`;
  const fd = fs.openSync(backup, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const directory = fs.openSync(path.dirname(backup), 'r');
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  const hash = value => createHash('sha256').update(value).digest('hex');
  const checksum = hash(bytes);
  if (hash(fs.readFileSync(backup)) !== checksum || hash(fs.readFileSync(source)) !== checksum) {
    throw new Error('The copy differs or the source changed; the writer is not safely frozen.');
  }
  const snapshot = JSON.parse(bytes.toString('utf8'));
  if (![1, 2, 3].includes(snapshot?.version) || !Array.isArray(snapshot.rooms)) throw new Error('Unsupported source snapshot.');
  console.log(JSON.stringify({ backup, version: snapshot.version, rooms: snapshot.rooms.length, sha256: checksum }));
} catch (error) {
  console.error(JSON.stringify({ backup, failure: error.code || error.name, action: 'Stop and inspect privately; existing files were not overwritten.' }));
  process.exitCode = 1;
}
JS
```

Retain the original disk and backup. Keep a second protected copy outside that single disk through an approved transfer, verifying the same checksum. If brought into this project, `server/.data/cutover/` is already ignored by Git. Never put full snapshots in chat, screenshots, issue bodies or logs: they contain hidden hands and private seat proofs. Preserve the actual deployed old binary/SHA with the backup record.

## 3. Check the target and import once

Use the dedicated Irish Rummy database and the approved server credential. Keep `IRISH_RUMMY_STATE_KEY=family-games` fixed. A different key selects different games. Keep the trusted CA configured as `IRISH_RUMMY_DATABASE_CA_FILE=server/certs/supabase-prod-ca-2021.crt` when running from the repository root.

Migration `002-account-state.sql` has already been verified by the coordinator. If verifying a different environment, apply `001-game-state.sql` first when the table does not exist, then `002-account-state.sql` before any v3 write. Check the live constraint definition and RLS/grants; do not enable public game-state access.

This query reports metadata without exposing hands or credentials:

```sql
SELECT state_key, revision, snapshot->>'version' AS version,
       jsonb_array_length(snapshot->'rooms') AS rooms,
       jsonb_array_length(COALESCE(snapshot->'accounts', '[]'::jsonb)) AS accounts
FROM irish_rummy_private.game_state
WHERE state_key = 'family-games';
```

Expect no row for the first import. If a row exists, stop and establish what it contains; do not delete it, overwrite it, or silently choose another key to bypass the refusal.

With the approved database secret injected into the maintenance environment, run from the exact reviewed release checkout. Substitute the actual backup filename printed above:

```sh
node server/scripts/import-state.js /var/data/PRESERVED-SNAPSHOT.json
```

The importer reads the source without modifying it, validates and normalizes it with timers suspended, and captures the complete canonical JSON snapshot once. It refuses any existing destination snapshot, including one with zero rooms. It writes once and compares every value in the database read-back with that exact canonical snapshot. Object-key ordering is immaterial; array contents/order, cards, scores, seat proofs, decisions, countdowns, chat, accounts, metadata and generated IDs must all match.

Expected success: `Imported N rooms and verified the complete saved snapshot. Source file is unchanged.`

`IMPORT_VERIFY_MISMATCH`, a network timeout, or another import error is a stop condition. A write might already have committed. Inspect and preserve the destination before retrying; the script must never be used as an overwrite or replay mechanism. Recheck the source checksum and expected room count after success.

## 4. Start one v2 server and validate restored play

1. Keep the persistent disk attached. Configure the reviewed Node 22 release with `IRISH_RUMMY_DATABASE_URL`, stable `IRISH_RUMMY_STATE_KEY`, trusted CA, and the two public Supabase Auth settings. Check that an unintended generic `DATABASE_URL` is not selecting another database; the dedicated URL takes precedence.
2. Start exactly one game process with `node server/src/index.js`. Stop the maintenance process as part of that controlled switch; never run old/new game writers together.
3. Check `/healthz` for `ok:true`, `persistence:"postgres"`, `state:"ready"`, and the preserved room count. The empty-database guard only protects against a missing target row while populated legacy disk state is present; it does not identify a wrong existing database row.
4. On the original browser and canonical origin, have two existing players sign in and explicitly use **Your profile → Recover older games**. A name or room code cannot claim a previous seat. Unclaimed games will not appear in a new account until the original browser proof is connected. Preserve browser storage during this step.
5. Verify the original hands, scores, turn, buy/pass state and room identity. Confirm private membership from another account and that unauthorized viewers receive no hand or room state. Test current invitation links and any enabled host-approved code-join path.
6. Make a legal move, wait for its saved acknowledgement, restart the server, and verify that exact resulting state returns for both players. Verify sign-out and same-seat return from another device after the legacy claim.
7. Record the released SHA, state key, backup checksum, import result and live checks. Restore deployment automation only when its tracked revision and single-writer behavior are understood. Keep preserved files until the restored games and backup policy are established.

A health response or successful local test does not prove restored family play.

## Rollback boundary

Before v2 accepts any new account claims or gameplay, the preserved pre-v2 snapshot and its exact old binary are a fallback. Run the old binary only against a new working copy of that preserved file, leaving the original backup intact. Remove both database URL variables from that rollback process so it cannot accidentally select Postgres. Never point the old binary at a v3 snapshot.

After v2 accepts any claims, moves or chat, the old disk copy is stale. Returning to it would discard subsequent progress. Freeze the v2 writer, preserve the current database snapshot through an approved private export, and fix forward with a version-3-compatible release. Do not change the version field to force an old binary to load it, and do not let an old server overwrite account ownership.

Stop if the final source cannot be preserved/validated, the destination is unexpectedly populated, full import verification fails, duplicate writers remain, or real account recovery fails. Keep the preserved source and any committed destination intact while investigating.

## Preflight preservation evidence

A preflight copy was created on the existing Render disk on September 13, 2026, without changing the running game server:

- Source: `/var/data/irish-rummy-state.json`.
- Backup: `/var/data/irish-rummy-state.json.preflight-v2-2a54fb48-0792-492a-89bc-adbaf8c66259.json` (exclusive creation, mode 0600, file fsynced).
- Snapshot version 1; seven rooms.
- Source and backup SHA-256: `0a801952a93236271f80d3d50e49287e2a1e72f4f055f3075c236e1541b1a7d3`.
- Source bytes were unchanged during copy verification. The writer was **not frozen**; this copy is not the final cutover snapshot and cannot replace the freeze/final backup above.
- Live runtime was Node v26.4.0. Neither database nor public Google-auth configuration was present on the deployed server.

The copy remains on the original disk; an independent protected copy still needs to be made before a production cutover. No game contents or recovery tokens were printed.
