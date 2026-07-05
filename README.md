# ☘️ Irish Rummy — Aunt Peggy's Game

A full-stack multiplayer web app for playing Irish Rummy online — solo against bots or with friends and family. Built with React, Node.js/Express, and Socket.io.

## Quick start (local)

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

Enter a name (no account needed — your seat is tied to a browser token, so a refresh or dropped connection reconnects you mid-game). Create a game, share the 5-letter room code, pick your lake-house portrait, or add bots and start. Anyone can join a running game as a spectator, and everyone shares the table chat. There's a 📖 rule book in the header for new players.

**Bot difficulties**: easy **Pippin** (draws blind, sloppy discards), medium **Tom Bombadil** (plan-driven play), hard **Saruman** (also buys cards that put him down instantly), and — only in custom games — **Peggy**, who plays every angle *and counts cards* (she reads the deck when choosing where to draw; disclosed in her tooltip). In simulation Peggy wins ~65% of 4-player games. Quick Play seats you against Pippin, Tom, and Saruman.

On your turn: click the deck or the discard pile to draw. Select cards (click) and use **Go down** to stage the round's contract — **✨ Auto-arrange** fills it for you whenever the server sees a valid combination in your hand. After going down, select a card and click any meld to lay off, drag cards to reorder your hand, and drag/click onto the discard pile to end your turn. When it's *not* your turn, a **Buy** button appears under the discard pile.

## The rules as implemented

- **Deck**: a real, tracked deck — 2×52+4 jokers (108) for 2–4 players, 3×52+6 jokers (162) for 5–6. The server asserts after *every* action that draw pile + discard pile + hands + table melds account for exactly every card.
- **Seven rounds**: 2 sets → set+straight → 2 straights → 3 sets → 2 sets+straight → set+2 straights → 3 straights (12 cards dealt in round 7, 11 otherwise). Dealer rotates; player left of dealer starts.
- **Sets**: 3+ cards of one rank, any suits (with two identical decks, 7♠ 7♠ 7♥ is a legal set). If your family plays the strict "three different suits" rule, start the server with `STRICT_SET_SUITS=1`. Cards added to sets **die**.
- **Straights**: 4+ consecutive, same suit. Ace plays low (A-2-3-4) or high (J-Q-K-A), no wrap-around. Straights stay **active**: extendable at both ends by anyone who has gone down.
- **Jokers**: wild (50 points if caught). A joker in a table straight can be swapped for the real card it represents — the joker then goes to your hand and **must be replayed before you discard** (the server enforces it; discarding the joker itself is the only escape hatch). Jokers in sets never move.
- **Buying**: every fresh discard opens a **buy window** — all other players choose Buy 💰 or Pass ✕. The host picks the timer per room (8 s / 30 s / 2 min / 1 hour for check-in-when-you-can games, or **no timer**: casual mode where play waits until everyone has answered). Anyone can **⏸ pause** a running timer to think; there's an *auto-pass* checkbox for faster games. A deck draw is held until everyone answers or time runs out. The current player always has priority: taking the discard voids all buys; drawing from the deck awards it to the highest-priority buyer clockwise **plus a penalty card**. **Each player gets 3 buys per round** (refreshed at every deal, tracked per player). Every buy is recorded in the 📜 ledger.
- **Scoring**: 2–9 face value, 10/J/Q/K = 10, Ace = 15, Joker = 50. Round ends when someone discards (or plays) their last card after going down; leftover hands are scored; lowest total after round 7 wins. Everyone advances rounds together, with a 9-second scoreboard pause between rounds.
- **Empty draw pile**: the discard pile (minus its top card) is reshuffled in.

## Architecture

```
irish-rummy/
├── server/                  Node.js + Express + Socket.io (in-memory state)
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

**Real-time flow**: every mutation goes through a socket event (`game:draw`, `game:goDown`, `game:layOff`, `game:swapJoker`, `game:discard`, `game:buy`…), is validated server-side (the server is fully authoritative — clients can't cheat), then each connected socket receives a *personalized* `room:state` (you only ever see your own hand; spectators see none).

**Connection drops**: seats are keyed to a per-tab session token, not to the socket. Refresh the page or reopen the laptop and you're back in your seat with your cards. Because the token is per *tab*, two tabs in the same browser are two different players — a couple can share one computer with two windows.

## Deploying to irishrummy.com

The app is self-contained: one Node process serves the built React client and the Socket.io room-code server. Use a Node web service, not static hosting or WordPress.

### Render

This repo includes `render.yaml`, so Render can create the service from the repository.

Service type: **Web Service**

Build command:

```bash
npm --prefix client install && npm --prefix client run build && npm --prefix server install
```

Start command:

```bash
node server/src/index.js
```

Render provides `PORT`, HTTPS, and custom-domain TLS automatically. Add `irishrummy.com` as a custom domain in the Render service, then point the Porkbun DNS records to the values Render gives you.

### Railway

Railway can run the same commands:

```bash
npm --prefix client install && npm --prefix client run build && npm --prefix server install
node server/src/index.js
```

No database is required. Running games live in memory, so a service restart ends active rooms; families can create a fresh room code after a restart.

The client auto-detects the path it's served from, so the same build works at `/`, `/rummy/`, or anywhere else.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | 3050 | HTTP + websocket port |
| `BASE_PATH` | *(empty)* | Path prefix behind a reverse proxy (e.g. `/rummy`) |
| `BOT_DELAY_MS` | 1200 | Bot "thinking" time per action |
| `ROUND_PAUSE_MS` | 9000 | Scoreboard pause between rounds |
| `BUY_WINDOW_MS` | 8000 | Default room buy timer (0 = casual: waits for everyone) |
| `STRICT_SET_SUITS` | off | `1` = the initial 3 cards of a set must be different suits |

## Design choices (and how to change them)

- **Nickname sign-in, no accounts** — chosen for zero-setup family play. To add Google/Apple/email later, drop Firebase Auth into the client, send the ID token in `hello`, and verify it server-side with `firebase-admin`; the token already *is* the identity key, so nothing else changes.
- **In-memory state, no database** — right-sized for a few concurrent games. A server restart ends running games (lobby and scores are lost). If persistence ever matters, serialize `Game` state to Supabase/Firestore on change and rehydrate on boot.
- **Web-only** — the UI is responsive and touch-friendly (tap-to-select works everywhere; drag-and-drop is a desktop nicety), so phones play fine in the browser.
