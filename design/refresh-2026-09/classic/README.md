# Classic card-room revision

The user rejected the animal icons, card design, and background in the first refresh. This revision replaces those elements throughout sign-in, lobby, waiting room, gameplay, and dialogs. The implementation direction is classic green felt, white traditional cards, and consistent line icons. It supersedes the adjacent first-refresh design documents; original assets and screenshots remain preserved.

## Outcome and constraints

Make the cards immediately familiar and legible, reduce background distraction, and replace decorative icons. Keep all game rules, interaction handlers, private player credentials, saved room/seat identifiers, recovery, and server persistence intact. Work is limited to the existing client and versioned design artifacts; no live family games are migrated or changed by this visual revision.

## Assets and code-native elements

- `concept.png`: generated full gameplay concept, created before implementation.
- `../../../client/public/art/felt-v3.png`: generated uniform green felt, tiled at 580 CSS pixels with a uniform green tint to keep the texture quiet.
- `../../../client/public/art/court-royals-v3.png`: generated transparent J/Q/K strip, 1774 × 887; three equal-width columns, displayed at 300% background width with 0/50/100% positions.
- `../../../client/public/art/card-back-v3.svg`: deterministic navy/white crosshatch pattern.
- `Icon.jsx`: one SVG line style for all app utilities and dialogs; decorative icons are hidden from assistive technology while button labels remain.
- `Card.jsx`: native rank indices and SVG suit pips, correct counts for 2–10, oversized aces, two-way corners and royal prints. The Joker uses a clear label and four-suit mark. These are intentional code-native representations of game data, so generated typography or pip-count mistakes cannot alter what a card means.
- Player portraits are replaced with six colored monograms. Existing avatar IDs remain compatible with saved games. The chooser labels identify the colors instead of exposing the old filenames.

The concept, felt, and royals were made with the built-in Image Gen tool. Its interface does not provide a model selector; these assets are not claimed to be pinned Images 2.5 output. See `PROMPTS.md` for generation briefs.

## Fidelity ledger

Compared `concept.png` and browser captures directly using the local image viewer. Captures came from the working application, not a mockup, at 1536 × 1024 and 375 × 812 requested viewports.

| Concept element | Implemented evidence | Assessment |
| --- | --- | --- |
| Full-page forest felt, no scenery or table rim | `game-desktop.png`, `lobby-desktop.png` | Matches the direction; generated texture is uniformly tinted for readability. |
| White sans-serif brand and restrained navigation | `game-desktop.png` | Matches; History and host Close table controls are retained functional requirements. |
| Colored circular initials in four-player rail | `game-desktop.png`, `waiting-desktop.png` | Matches; actual saved player names and bot seats replace sample concept content. |
| Traditional white card faces and geometric navy back | `game-desktop.png` | Matches; generated royal figures replace the concept's sample figures. Correct native pips and indices take priority over concept inaccuracies. |
| Quiet shared felt for melds and hand | `game-desktop.png` | Matches; no separate cream hand panel or framed playfield. |
| Buy/pass controls beside piles | Verified in the two-player restored game | Vertical desktop controls; all timer, pause, auto-pass, and eligibility behavior retained. They are absent from the final four-player capture because it is the local player's draw turn. |
| Clear hand, restrained sorting controls | `game-desktop.png`, `hand-mobile.png` | Matches; phone hand wraps into two rows to keep each rank selectable and readable. |
| Consistent small line icons | `scores-desktop.png`, `waiting-desktop.png` | Matches; phone utility icons are omitted while text labels remain, preventing horizontal overflow. |
| Same visual system in lobby | `lobby-desktop.png`, `lobby-mobile.png` | Intentional extension: a fan of actual card components replaces the scenic illustration. |

Intentional copy changes: “Welcome to the table” replaces “Welcome to the lake,” and “Choose your color” replaces “Choose your portrait.” All gameplay text remains connected to actual game state. The screenshots contain only synthetic local QA players and rooms.

## Verification

- Production Vite build passed after the final source changes: 67 modules, no build errors.
- Exact source/asset copies were used by the local preview.
- Existing two-player saved game reloaded with the same hands and melds. Existing four-player room rejoined with all 11 cards and all four seats.
- Sort by suit worked. Enter selected the Queen; Space deselected it, reflected by `aria-pressed`.
- Browser DOM confirmed actual center pip counts for rendered 2, 4, 8, and 10 cards. Source review checked all 2–10 layouts.
- Player color selection remained selected after reload. Six color choices have distinct accessible labels and preserve saved IDs.
- Scores dialog and waiting-room chat rendered with readable dark text on light surfaces. No browser warning/error logs in the final check.
- Mobile page width stayed within the viewport after the toolbar correction. All 11 cards were reachable in the wrapped hand.
- Independent review compared the 76 existing GameScreen/ChatPanel interaction handlers; their behavior was unchanged. It also caught an invalid initials-font shorthand and two low-contrast monogram colors, both corrected.
- Built CSS rewrites artwork URLs to `../art/...` under existing Vite `base: './'`; a subpath deployment resolves the new assets alongside the other static assets.
- `git diff --check` passed on changed client sources.

The earlier database/recovery test evidence remains in `../../../docs/REFRESH-VERIFICATION.md`. This revision does not deploy the app or perform the pending live Render-to-Supabase migration.
