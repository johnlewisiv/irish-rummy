# Refresh and recovery verification — September 12, 2026

> The subsequent [classic card-room revision](../design/refresh-2026-09/classic/README.md) replaces the first visual direction described below. The database and recovery evidence remains applicable.

## Implemented

The sign-in, saved-player chooser, lobby, waiting room, cards, game table and chat
now share an ivory, pine and brass lake-house design. Two generated production
assets replace the hero/card back without deleting the original artwork.
Concepts, exact prompts, implemented screenshots and comparison notes are in
[the design folder](../design/refresh-2026-09/FIDELITY-QA.md).

Game actions, chat, bot moves and timers commit before success is announced.
Postgres revision checks prevent an older server from overwriting newer saves.
Storage errors pause play and recover from the saved authority. Family tables
and private browser profiles survive normal reconnects and closed tabs; public
player IDs no longer expose the private credentials used to recover seats.

## Evidence

- `npm test`: passed the complete server rules, engine, room, file persistence,
  durability, timer and bot self-play suites; all 15 additional database,
  browser-profile and socket integration scenarios passed.
- The database test executes the production migration twice in real PostgreSQL
  via PGlite, checks schema privileges and malformed snapshots, then verifies
  revision conflicts and exact snapshot recovery after closing/reopening the DB.
- Real socket tests cover private hands, token secrecy, two players and a
  spectator, same-room reconnect, explicit lobby preference, a killed/restarted
  server, failed saves and exactly one accepted move after recovery. A separate
  regression checks an untimed held draw when the last available buyer leaves
  and the drawing player returns alone. Another confirms all clients leave
  a closed room after a committed save whose response was lost.
- `npm --prefix client run build`: passed; 66 modules, no build errors.
- Browser checks on desktop and a 375-pixel phone viewport covered creating a
  table, bots, drawing, staging and confirming melds, discarding, page reload,
  a fresh tab's saved-player chooser, leaving/rejoining, and four-player play.
  The recovered hand and both existing melds matched. Browser warnings/errors
  were empty. The standard web-game smoke script also completed successfully.
- Files in Documents were intermittently delayed by macOS cloud hydration.
  Tests and production build ran in an isolated local copy. All 28 source,
  server-test, integration-test and database-migration files were compared
  byte-for-byte against the project after the final mobile CSS change: no
  differences. The preview uses synthetic QA games, not production saves.

## Supabase and live release status

The new dedicated `irish-rummy` project is `djsgajbcrydzcbktzemc` in Canada
Central. The Data API was disabled during creation. The final private-schema
migration was applied successfully. Dashboard verification showed RLS enabled,
no anonymous schema/read access, and zero saved namespaces.

**This is not yet a live database cutover.** The server adapter successfully connected to Supabase using the saved secret
and the official public CA with certificate verification enabled. Read-only
queries confirmed the private table and empty production namespace. A subsequent
real Supabase test used one isolated synthetic namespace and two players: draw
and chat saved, the server/store restarted, the exact game snapshot and both
hands/seat IDs/chat returned, and a legal discard saved after recovery. Both test
servers closed; exactly that test row was removed. The database returned to zero
rows and `family-games` was never created or modified. The current Render service reported
seven rooms with disk persistence. Preserve and import its current snapshot
before enabling the database-backed release. Never initialize an empty
`family-games` row in advance of that import.

Use [the preservation and cutover guide](SUPABASE-PERSISTENCE.md). Completion
requires a verified app-to-Supabase connection, a preserved and imported live
snapshot, one deployed server, and two existing family players confirming their
hands/turn/scores before and after a server restart. Clearing browser storage or
moving to a different device is not covered by account recovery in this release.
