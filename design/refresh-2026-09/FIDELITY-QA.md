# Visual refresh verification

The implemented sign-in, lobby, waiting room, and game use the selected ivory/pine/brass concept system. The lobby and game concepts and rendered screenshots were explicitly reopened with `view_image` for comparison. No material visual mismatch remains in the inspected desktop lobby/game or final mobile empty-table view; intentional functional differences are listed below.

## Evidence and method

- Concepts: [lobby](lobby-concept.png), [game](game-concept.png), both 1536 × 1024.
- Browser plugin initialization was attempted first but failed while loading its signed native `classic-level` dependency. Parent QA used the working CUA browser surface and a local isolated runtime at `http://127.0.0.1:3051` after the original iCloud-backed dependency folder stalled.
- [Desktop lobby](verified/lobby-desktop.png): 1425 × 950 captured pixels.
- [Mobile lobby](verified/lobby-mobile.png): 440 × 672 captured pixels; this is the initial viewport and the remaining forms continue vertically.
- [Desktop waiting room](verified/waiting-desktop.png): 1425 × 950 captured pixels.
- [Desktop game](verified/game-desktop.png): browser configured to 1536 × 1024; final saved PNG is 1536 × 1016, inspected at native width.
- [Final mobile game](verified/game-mobile.png): browser configured to 390 × 844; capture is 375 × 812. The four-player state shows its first hand row within the initial viewport.
- Parent reported final browser error/warning logs were empty.

## Comparison ledger

| Point | Concept and render evidence | Result / adjustment |
| --- | --- | --- |
| Palette | Ivory page, deep pine ink/playing field, brass details in both concepts and final captures | Matched using shared explicit color tokens; no hero tint or wood-framed panels |
| Layout | Lobby illustration left with open forms right; game player rail, playfield, cream hand band | Matched. Empty lobby content centers vertically because the concept's sample populated row is absent |
| Typography | Editorial serif brand/headings, readable sans-serif controls | Applied to headings, form controls, table utilities, players, chat and modal chrome. Mobile sign-in whitespace around a hidden line break was corrected |
| Image treatment | Straight scenic frame and cream-bordered illustrated deck | Separate production hero/card-back generated, saved to project, loaded and inspected. Natural cover crops preserve chairs/lake; no overlay |
| Card readability | Cream cards, dark blue/brick suit marks, restrained court illustrations | Larger desktop cards, clear corner ranks, preserved wildlife crests, selected/hover lift and brass selected outline. Enter/Space select interactive cards |
| Controls | Family-create and join forms, room recovery, Buy/Pass and sorting | Real controls. Server-driven state replaces concept sample values; mandatory timers, auto-pass and history remain available |
| Mobile density | Primary actions and hand should remain accessible | Removed mobile empty-felt min-height, shortened piles, removed duplicate empty-table contract copy, and reduced gaps. First hand row moved roughly 100px upward; laid melds still expand |
| Player/control labels | No accidental word splits or misleading status copy | Empty label changed to “Melds appear here.” Player card/score tokens kept together; phone buy-chip image hidden so “Buy (3)” fits one line |
| Accessibility/motion | Code-native controls with restrained motion | Inputs/portraits/cards/deck/chat have accessible labels; rules closes with Escape; focus rings visible; reduced-motion mode disables animation; decorative bounce/pulse removed |

## Above-the-fold copy audit

Lobby uses the planned brand, “A seat for everyone.”, welcome sentence, “Start a family game”, “Create game”, “Have a room code?”, “Join game”, “Watch instead”, “Your tables”, and “Practice with bots”. Actual player/room names, empty-state text, room codes, Refresh/Watch/Close controls are necessary live-data/workflow extensions. There are no new decorative badges, fake metrics, or marketing claims.

Game copy retains the real seven-round contract, turn status, draw/discard labels, sorting, chat and buy mechanics. The concept's “The table is yours.” was intentionally replaced with “Melds appear here.” because it was misleading during an opponent's turn. Profile-recovery copy, waiting-room settings, and history are functional extensions detailed in [DESIGN.md](DESIGN.md).

## Verified interaction path

Parent browser QA reported: create family room, add a bot, select no-timer settings, Buy/Pass flow, draw, automatically stage and submit two sets, discard, reload with the same five-card hand and two melds, open a fresh tab and explicitly select the saved player to recover that same seat/hand, deliberately leave while preserving the table, and start a four-player practice game. Existing-tab automatic restoration and fresh-tab explicit player choice were checked separately. These are local browser checks; production deployment and live-database verification belong to the parent release audit.

## Intentional deviations

- Existing wildlife avatars, court crests and joker stay recognizable; the hero and card back are newly generated. Plain suit pips/rank labels remain code-native for clarity.
- The small decorative pine logo in the game concept is omitted; the typographic brand carries the identity.
- Real hand size, live player counts, valid actions, buy timers, histories and saved-player recovery replace the simplified concept's sample state.
- Phone layout favors playable cards and controls; it does not retain desktop empty-felt height.
- Built-in Image Gen exposes no model selector. These assets are not claimed to have been generated with a pinned Images 2.5 model.
