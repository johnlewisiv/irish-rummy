# Irish Rummy v2

A full-stack multiplayer web app for playing Irish Rummy online — solo against bots or with friends and family. Built with React, Node.js/Express, and Socket.io.

## Quick start (local)

Use Node.js 22 or later.

```bash
# 1. Build the client
cd client && npm install && npm run build

# 2. Run the server (serves the built client + websockets)
cd ../server && npm install && npm start
# → open http://localhost:3050
```

For development with hot reload, run `npm run dev` in **both** folders (client dev server on :5173 proxies websockets to the server on :3050).

Run the test suite (rule unit tests, engine mechanics tests, and full 7-round bot self-play with deck-integrity checks):

```bash
cd server && npm test
```

## Playing

Sign in with Google to see **My games**. Create a private table and share its invitation link. An invited player signs in before joining; their seat then appears on their own profile and can be reopened on another device. Players can also enter the five-character game code: existing members reopen their seat, and newcomers request host approval before joining. The code alone does not grant access. Spectators also need an invitation and never see anyone’s hand. Practice with bots is available without an account.

Choose one of six retro lake-house illustrations in your profile: canoe, dock, cabin, lantern, sailboat, or coffee. Your Google photo is an optional choice. Existing browser saves can be connected explicitly through **Your profile → Recover older games**; a matching name is never proof of ownership.

Bots are **Riley** (easy), **Morgan** (medium), **Casey** (hard), and **Jordan** (expert). The expert bot retains the legacy deck-aware behavior; it can inspect the draw pile. Practice uses the first three difficulties.

On your turn, use the action panel above your hand to draw, go down, or discard. Tap one card to select it; the Discard button names the selected card. To go down, assemble the round’s sets and straights; a valid suggested arrangement is prefilled when available. Once down, select a card and tap a table meld to add it. Sort your hand by suit or rank. Dragging is optional.

When someone else is drawing, the same panel asks **Buy or Pass**. A buy is a request: the current player can take the discard, and otherwise the first buyer clockwise wins it plus one extra card. Choices are acknowledged only after saving; an uncertain move is checked on reconnect and never automatically replayed. Scores, rules, history, chat, sound, auto-pass and host controls are in the table menu.

## The rules as implemented

- **Deck**: a real, tracked deck — 2×52+4 jokers (108) for 2–4 players, 3×52+6 jokers (162) for 5–6. The server asserts after *every* action that draw pile + discard pile + hands + table melds account for exactly every card.
- **Seven rounds**: 2 sets → set+straight → 2 straights → 3 sets → 2 sets+straight → set+2 straights → 3 straights (12 cards dealt in round 7, 11 otherwise). Dealer rotates; player left of dealer starts.
- **Sets**: 3+ cards of one rank, any suits (with two identical decks, 7♠ 7♠ 7♥ is a legal set). If your family plays the strict "three different suits" rule, start the server with `STRICT_SET_SUITS=1`. Cards added to sets **die**.
- **Straights**: 4+ consecutive, same suit. Ace plays low (A-2-3-4) or high (J-Q-K-A), no wrap-around. Straights stay **active**: extendable at both ends by anyone who has gone down.
- **Jokers**: wild (50 points if caught). A joker in a table straight can be swapped for the real card it represents — the joker then goes to your hand and **must be played or discarded itself before another card may be discarded**. Jokers in sets never move.
- **Buying**: every fresh discard opens a **buy window** — all other players choose Buy or Pass. The host picks the timer per room (8 s / 30 s / 2 min / 1 hour for check-in-when-you-can games, or **no timer**: casual mode where play waits until everyone has answered). Anyone can **pause** a running timer to think; there's an *auto-pass* checkbox for faster games. A deck draw is held until everyone answers or time runs out. The current player always has priority: taking the discard voids all buys; drawing from the deck awards it to the highest-priority buyer clockwise **plus a penalty card**. **Each player gets 3 buys per round** (refreshed at every deal, tracked per player). Every buy is recorded in the history.
- **Scoring**: 2–9 face value, 10/J/Q/K = 10, Ace = 15, Joker = 50. Round ends when someone discards (or plays) their last card after going down; leftover hands are scored; lowest total after round 7 wins. Everyone advances rounds together, with a 9-second scoreboard pause between rounds.
- **Empty draw pile**: the discard pile (minus its top card) is reshuffled in.

## Architecture

```
irish-rummy/
├── server/                  Node.js + Express + Socket.io
│   ├── src/deck.js          Physical deck construction, card values, shuffle
│   ├── src/rules.js         Contracts, set/straight validation (with joker
│   │                        inference), layoff rules, joker-swap rule, and a
│   │                        backtracking meld solver (bots + the auto-arrange hint)
│   ├── src/game.js          Game engine: turn state machine, buying, going down,
│   │                        laying off, scoring, round progression, deck-integrity
│   │                        assertion, per-viewer state views (hands stay secret)
│   ├── src/bots.js          Bot AI: plan-based play (greedy partial contract fill)
│   │                        in three difficulties
│   ├── src/rooms.js         Lobby: room codes, seats, bots, spectators, sweeping
│   ├── src/persistence.js   Server-only Postgres or atomic disk snapshots
│   ├── src/durable-rooms.js Serialized moves, commit-before-ack, failure recovery
│   ├── src/index.js         Socket protocol + static hosting of the built client
│   └── test/                rules.test.js · engine.test.js · simulate.js
└── client/                  React 18 + Vite + Tailwind v4
    ├── src/socket.js        Connection, session token, promise-based calls
    ├── src/App.jsx          Sign-in → lobby → room routing, toasts, reconnect
    ├── src/GameScreen.jsx   Waiting room + the table: piles, melds, buy button,
    │                        go-down staging, drag-and-drop hand, overlays
    ├── src/Card.jsx         Card rendering
    └── src/ChatPanel.jsx    Table chat (players + spectators)
```

**Real-time flow**: socket actions and game timers enter one server queue. The engine validates each action, checks the deck, and commits the complete snapshot before acknowledging the move or broadcasting the new state. Each viewer receives a personalized hand. Public player IDs are separate from the private tokens used to recover seats.

**Connection drops**: Supabase Auth persists and refreshes the Google session. The server verifies the token before accepting its identity, checks expiry and room membership on access, and sends only your own hand. Each tab remembers its selected table. Account changes immediately hide the previous account’s room and chat. Older browser identities remain available only as explicit ownership proof for migration; guest sessions cannot enter shared tables.

**Restart recovery**: configure `IRISH_RUMMY_DATABASE_URL` to use a dedicated Supabase Postgres database. Rooms, hands, scores, chat, buy windows, and room codes are saved in a private schema. Failed saves pause play and return an error; recovery reloads the database rather than replaying an uncertain move. Corrupt or unreadable saves block startup. Local development defaults to an atomic file under `server/.data/`; Render can continue using its existing persistent disk until database migration is complete.

Use **No timer** for family games played across hours or days. Tables with human players are retained until the host closes them. Keep one server instance: the database rejects stale concurrent writers, but it is not a shared multi-server Socket.io adapter.

## Deploying to irishrummy.com

V2 also requires Google OAuth configuration and SQL migration `server/db/002-account-state.sql` before switching an existing database to snapshot version 3. Keep the old production state safely preserved; old binaries cannot read version 3. See `docs/v2/PROVIDER-SETUP.md`.

The app is self-contained: one Node process serves the built React client and the Socket.io room-code server. Use a Node web service, not static hosting or WordPress.

### Render

This repo includes `render.yaml`, so Render can create the service from the repository.

Service type: **Web Service**

The existing deployment uses a web service and persistent disk. Keep its disk attached while importing existing games into Supabase. Database storage does not itself prevent the web service from sleeping or keep WebSocket connections open.

Build command:

```bash
cd client && npm install && npm run build && cd ../server && npm install
```

Start command:

```bash
node server/src/index.js
```

Render provides `PORT`, HTTPS, and custom-domain TLS automatically. Add `irishrummy.com` as a custom domain in the Render service, then point the Porkbun DNS records to the values Render gives you.

Persistent room state:

- Disk mount path: `/var/data`
- Disk size: 1 GB is plenty for family games
- Env var: `ROOM_STATE_FILE=/var/data/irish-rummy-state.json`

Only files under the disk mount survive a Render restart. Production refuses to start without either database storage or a configured persistent file. See [the database migration guide](docs/SUPABASE-PERSISTENCE.md) before setting the database URL on an existing deployment. A populated disk snapshot and an empty database require an explicit import.

### Railway

Railway can run the same commands:

```bash
cd client && npm install && npm run build && cd ../server && npm install
node server/src/index.js
```

Set `IRISH_RUMMY_DATABASE_URL` for Supabase storage, or configure `ROOM_STATE_FILE` on a mounted persistent volume. Never put the database URL into a `VITE_` variable or browser code.

The client auto-detects the path it's served from, so the same build works at `/`, `/rummy/`, or anywhere else.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `SUPABASE_URL` | unset | Supabase Auth project URL (public) |
| `SUPABASE_PUBLISHABLE_KEY` | unset | Public key for Auth; never a service-role key |
| `PORT` | 3050 | HTTP + websocket port |
| `BASE_PATH` | *(empty)* | Path prefix behind a reverse proxy (e.g. `/rummy`) |
| `BOT_DELAY_MS` | 1200 | Bot "thinking" time per action |
| `ROUND_PAUSE_MS` | 9000 | Scoreboard pause between rounds |
| `BUY_WINDOW_MS` | 30000 | Default room buy timer (0 = casual: waits for everyone) |
| `STRICT_SET_SUITS` | off | `1` = the initial 3 cards of a set must be different suits |
| `ROOM_STATE_FILE` | `/var/data/irish-rummy-state.json` when `/var/data` exists | JSON snapshot path for persistent rooms |
| `IRISH_RUMMY_DATABASE_URL` | unset | Server-only Postgres connection; takes precedence over file storage |
| `IRISH_RUMMY_STATE_KEY` | `family-games` | Snapshot namespace within the private game-state table |
| `IRISH_RUMMY_DATABASE_CA_FILE` | unset | Optional trusted CA certificate for verified database TLS |

## Design choices (and how to change them)

- **Google accounts and private memberships** own shared games. Invitation tokens are random, host-managed, and carried in URL fragments. Legacy browser records are preserved for explicit recovery.
- **Server-only Postgres snapshots** preserve complete game state with version checks. Hidden hands and recovery tokens stay out of the Supabase Data API. Atomic disk storage remains available for development and the existing deployment during migration.
- **Web-only** — the UI is responsive and touch-friendly (tap-to-select works everywhere; drag-and-drop is a desktop nicety), so phones play fine in the browser.

## Verification and artwork

Install root, client, and server dependencies, then run `npm test`. The full suite covers rules, engine simulations, saved browser profiles, SQL constraints/permissions, and multiplayer recovery. SQL tests use a local PostgreSQL WASM engine; they do not substitute for checking the deployed Supabase connection.

V2 keeps the accepted traditional cards and uses deliberately flat retro lake-house illustration for avatars and the walnut background. Current concepts and prompts are in `design/v2/`. UI text, controls, ranks and suits remain rendered by the app. See `docs/v2/GOAL.md`, `docs/v2/VERIFICATION.md`, and `docs/v2/PROVIDER-SETUP.md` for implementation checks. The completed production cutover and remaining real-family-device checks are recorded in `docs/v2/RELEASE-2026-09-13.md`.
