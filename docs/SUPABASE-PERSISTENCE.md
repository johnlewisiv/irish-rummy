# Durable family games

The Node server is the only authority. Each accepted socket action, chat message,
bot move, and timer callback enters one queue. The full set of rooms is committed
atomically before its result is acknowledged or broadcast. A database failure
pauses play; the server reloads the last database state before accepting another
move. It never automatically repeats a player's request after a timeout.

Hands, decks, discards, table melds, scores, turn, buy decisions, room settings,
chat and private seat credentials are stored in the snapshot. Game timers pause
while all humans are away and resume when a player reconnects. Family tables
remain available until their host closes them. Leaving a lobby also retains the
seat. Timer countdowns resume from saved remaining time after a restart; this is
not a real-time simulation of the hours that the server was offline.

## Database setup

Use the separate **irish-rummy** Supabase project selected for this application.
Do not run these statements in Nurse Froge or another application's project.

1. Run [server/db/001-game-state.sql](../server/db/001-game-state.sql) in that project's SQL editor.
   It creates only `irish_rummy_private.game_state`; it does not touch `public`
   tables or enable a Data API. RLS is on with no anon/authenticated policies.
2. Provision a server login with only schema USAGE and table SELECT, INSERT,
   UPDATE plus its RLS policy, as shown in the SQL comments. Set its password
   through the project's approved credential interface; never commit it.
   The table owner can perform the initial import. Use a dedicated server role
   for ongoing operation where the project's access configuration supports it.
3. Obtain the **Session pooler** connection URL from Supabase's Connect panel
   (usually IPv4, port 5432). URL-encode the password. Put the URL in Render's
   secret environment field `IRISH_RUMMY_DATABASE_URL`.
4. Keep `IRISH_RUMMY_STATE_KEY=family-games` stable across deployments. Changing
   the key chooses a different set of rooms. Do not put any database credential
   in a `VITE_` variable, client bundle, Git file, screenshot, or chat message.
5. Remote TLS certificate verification is required. If the project needs its
   database CA certificate, download it and set
   `IRISH_RUMMY_DATABASE_CA_FILE=/path/to/supabase-ca.crt`. The driver removes URL
   SSL parameters so a copied `sslmode=require` cannot disable verification.

The server uses a pool of at most two connections and five-second connection /
statement timeouts. SQL uses bound parameters. All data lives in one row per
state key, appropriate for a small family game service. This is not a design for
large public matchmaking or multiple concurrently active server processes.

## Preserve existing Render games before cutover

The old deployment stores rooms at `/var/data/irish-rummy-state.json`. Preserve
that disk and its original file. The existing live snapshot must be migrated;
turning on a connection URL alone does not transfer games.

1. Schedule a short maintenance window and stop the old server from accepting
   moves. Do not run old and new writers concurrently.
2. Copy the current disk file to a new preservation filename on the same
   persistent disk; do not overwrite an earlier copy. Verify it parses and
   record its room count. The live health endpoint's room count is a useful
   comparison, not a substitute for checking the snapshot.
3. After applying the SQL and setting the server-only database secret in the
   maintenance environment, run:

   ```sh
   node server/scripts/import-state.js /var/data/PRESERVED-SNAPSHOT.json
   ```

   The script validates the source, upgrades public seat IDs, writes once,
   rereads the result, and prints only the verified room count. It refuses an
   existing destination row, even an empty one, and never deletes or modifies
   the source. A network interruption may have committed the import; inspect
   the destination before retrying instead of deleting it.
4. Start exactly one new server with the database URL and preserved disk still
   attached. Check `/healthz`: `ok:true`, `persistence:"postgres"`, `state:"ready"`
   and the expected room count. If the database is empty but configured disk
   rooms exist, startup stops with `MIGRATION_REQUIRED` rather than hiding them.
5. Have two existing family profiles rejoin the same room and compare hands,
   scores, current player and buy decisions. Perform a legal move; restart the
   server and confirm that exact resulting state returns. A health response
   alone does not verify restored play.

The import can run from Render's maintenance shell or another approved server
context with access to the preserved file and secret. Never paste the complete
snapshot into a public tool: it contains private hands and bearer tokens.

## Recovery and limits

- A corrupt or unsupported snapshot, missing table, invalid certificate, or
  unreachable database blocks startup. Existing files are never reset to `[]`.
- A save error sends `server:status` with `state:"paused"` and makes health return
  503. No success acknowledgment or new state is sent for the failed action.
- Every five seconds, a paused server attempts to reload its database authority.
  If the failed request actually committed before its response was lost, that
  committed position is recovered. The request is not replayed.
- Revision conflicts indicate another writer. Automatic recovery is disabled
  for that conflict: stop duplicate instances, then restart the intended one.
  Deploy a single instance. Revision checks prevent lost updates; they do not
  provide a shared real-time lobby across replicas.
- Client reconnect identity remains a private per-browser bearer credential.
  Public seat IDs are broadcast in the legacy `token`/`id` fields; credentials
  stay server-only. Clearing browser data loses that browser's saved recovery
  identities; account-based cross-device recovery is not included. A room code
  alone does not claim another person's seat.
- Old clients and old server versions exposed seat bearer tokens. This release
  prevents new leakage but does not revoke previously exposed credentials.
- Local development without a database uses `server/.data/rooms.json`, ignored
  by Git, with atomic replacement and file/directory sync. Production must have
  a database URL or persistent disk; ephemeral deployment storage is not a safe
  production destination.
- Database durability does not replace backups. Use the project's backup/export
  policy. Keep the preserved cutover file until the restored games are verified.

## Verification

`npm --prefix server test` covers game rules, deck conservation, disk restart
restoration, serialized delayed saves, rollback, lost commit responses, storage
outages, corrupt snapshots and automatic recovery. Root-level database and
socket integration tests provide additional end-to-end checks when present.
A local test does not prove a live Supabase connection or a completed deployment.

Source references: [Supabase connection options](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement),
[node-postgres SSL](https://node-postgres.com/features/ssl).
