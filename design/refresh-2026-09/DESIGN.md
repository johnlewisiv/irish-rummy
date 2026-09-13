> Superseded by [the classic card-room revision](classic/README.md) after feedback on the icons, cards, and background. This file preserves the first refresh for reference.

# Irish Rummy refresh — September 2026

## Outcome and verification

A complete visual refresh of sign-in, lobby, waiting room, and live family games. Preserve Aunt Peggy's lake-house personality, game mechanics, chat, room recovery, and readable cards. Verify by production build and desktop/mobile rendered workflows, compared with the adjacent generated lobby/game concepts. Preserve the original artwork as version one.

## Accepted direction

Self-selected implementation direction under the user's total-refresh request: warm ivory page `#f4f1e8`, deep pine ink `#203d34`, pine playing field `#294e41`, muted brass `#af8e50`, thin neutral rules, modest 8px controls, Georgia editorial headings, system sans-serif controls. No wood-texture framing, giant logo art, glowing controls, or continuous decorative animation.

Lobby: minimal brand/rules header; large straight portrait lake-house illustration left, functional open sections right. The image has no tint or overlay. On narrow screens it becomes a short scenic banner above the form. The header, forms, player lists, buttons, chat, hand, and scoring stay code-native.

Gameplay: compact cream header and player rail, large deep pine playfield, classic ivory cards, cream hand band, plain text utilities. Selected cards rise and receive a brass outline. Existing wildlife court emblems, joker and player portraits remain part of the family identity, while the illustrated card back is refreshed.

## Allowed copy and components

- Brand: Irish Rummy. Utility: How to play.
- Lobby: A seat for everyone. Welcome back, {name}. Gather the family or deal a practice hand. Start a family game. Create game. Have a room code? Join game. Watch instead. Your tables. Rejoin. Practice with bots.
- Sign-in extension required for existing workflow: Welcome to the lake. Pull up a chair. Aunt Peggy's game is better together. Your name. Take a seat. Continue as {name}. Or start as someone new.
- Waiting extension: {room name}, room code/copy, Players, Choose your portrait, Add bot, Buy timer, Start game, Leave, Close room, Table chat.
- Gameplay extension: existing round contract, buy rules, turn status, meld staging, rules, scores, log and end-of-round screens are functional requirements preserved in the same visual system.
- Recovery extension: explicit saved-player choices, connection/restoring/saving status, deliberate room exits; exact content depends on verified server state.

## Assets

- `lobby-concept.png`, `game-concept.png`: complete primary-state design references.
- `../../client/public/art/lake-house-v2.png`: standalone hero; cover framing, no overlay.
- `../../client/public/art/card-back-v2.png`: standalone pine/brass two-way deck back, cover framing.

All four were generated with the built-in Image Gen tool. Its interface exposes no model selector, so these are not represented as pinned Images 2.5 output. The requested model names were researched separately by the parent task.

## Intentional concept deviations

No decorative pine logo is recreated from the game concept. The typographic brand is sufficient. Existing wildlife avatar/court assets preserve recognizability. Live content and server-authoritative hand sizes replace the concept's sample names/cards. The full existing BuySidebar is retained because timers, auto-pass, and pause are functional requirements absent from the simplified concept. A gameplay history utility is preserved. Sign-in profile recovery is added to meet the persistence requirement.

## Completion audit

Completed local visual comparison and interaction evidence are recorded in FIDELITY-QA.md. Parent owns the final live-database/deployment audit.
