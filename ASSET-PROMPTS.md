# 🎨 Image prompts — "Card Game at the Lake House"

Generate each asset below, name the file exactly as shown, and drop them all into
`client/public/art/`. Assets 1 and 2 work the moment they're in the folder;
send the rest back to me and I'll wire them into the cards, avatars, and buttons.
The layout and mechanics stay exactly as they are — these images just re-skin
the existing slots, still top-down.

**Paste this style block at the end of EVERY prompt** so all assets match:

> Style: cozy lake-house card night. Warm honey cedar wood, deep pine green,
> lake-water blue, cream canvas, and brass accents. Soft late-afternoon light.
> Hand-painted vintage national-park-poster illustration style with clean,
> simple shapes and subtle texture. No text unless specified, no watermarks,
> no photorealism.

---

## 1. `table-surface.jpg` — the tabletop (auto-wired ✅)
**Square, 2048×2048, no transparency.**

> Directly overhead top-down view of an empty lake-house card table: warm
> honey-colored cedar planks with visible grain, softly worn from years of
> family card games, a few faint water-ring stains from lemonade glasses,
> gentle lacquer sheen catching window light from one side. Even lighting,
> no objects on the table, no strong shadows, usable as a seamless background
> texture. + style block

## 2. `page-bg.jpg` — behind the table (auto-wired ✅)
**Landscape, 2560×1440, no transparency.**

> Directly overhead top-down view of a darker weathered boat-dock floor made of
> broad gray-brown planks, edges fading into soft shadow vignette at the frame
> borders, very subtle and low-contrast so interface elements placed on top stay
> readable. A hint of lake water visible through one plank gap in a corner.
> + style block

## 3. `card-back.png` — the card back
**Portrait 5:7 (e.g., 750×1050), rounded corners baked in, transparent outside the corners.**

> Playing-card back design, perfectly symmetrical when rotated 180 degrees:
> a serene lake scene medallion in the center — a loon floating on still water
> with tall pines and a small cabin mirrored above and below — inside a
> decorative double border of intertwined pine branches and tiny shamrocks,
> deep pine green background, cream and brass linework. Ornamental, elegant,
> like a premium card deck. + style block

## 4. `card-joker.png` — the joker art
**Square, 1024×1024, transparent background.**

> A cheerful loon wearing a red-and-green jester hat with tiny bells, wings
> spread in a playful shrug, standing on a lily pad, centered emblem
> illustration with no background. + style block

## 5–7. Court-card crests
**Square, 1024×1024, transparent background, ink-stamp two-tone (deep charcoal + brass) so they sit cleanly on the cream card face.**

- 5. `court-jack.png`
  > Emblem of a young paddler kneeling in a wooden canoe holding a paddle like
  > a lance, two-tone ink-stamp illustration, no background, no text. + style block
- 6. `court-queen.png`
  > Emblem of an elegant great blue heron standing tall among cattails wearing
  > a delicate crown, two-tone ink-stamp illustration, no background, no text. + style block
- 7. `court-king.png`
  > Emblem of a majestic bull moose with wide antlers wearing a crown, head-on
  > portrait, two-tone ink-stamp illustration, no background, no text. + style block

## 8–13. Player avatars (one per seat, bots included)
**Square, 512×512, circular composition on a solid muted-color disc, transparent outside the circle.**

- 8. `avatar-loon.png` — for **Peggy** (hard bot)
  > Circular portrait of a wise elderly loon wearing half-moon reading glasses
  > and a knitted shawl, holding a fan of playing cards, kind but shrewd
  > expression. + style block
- 9. `avatar-fox.png` — for **Siobhán** (medium bot)
  > Circular portrait of a clever red fox in a cable-knit sweater, one eyebrow
  > raised, holding playing cards close to the chest. + style block
- 10. `avatar-chipmunk.png` — for **Paddy** (easy bot)
  > Circular portrait of a sleepy, happy chipmunk with a mug of cocoa,
  > playing cards scattered, one card stuck to his cheek. + style block
- 11. `avatar-bear.png` > Circular portrait of a gentle black bear in a plaid
  flannel shirt holding tiny playing cards in huge paws. + style block
- 12. `avatar-mallard.png` > Circular portrait of a confident mallard duck with
  a captain's hat and a poker face. + style block
- 13. `avatar-trout.png` > Circular portrait of a grinning rainbow trout wearing
  a green visor like a card dealer. + style block

## 14. `logo.png` — the title
**Wide, ~1600×600, transparent background.**

> Hand-carved wooden sign that reads "IRISH RUMMY" in bold rounded carved
> letters painted cream with brass edges, a small green shamrock inlay above
> the letters, mounted look with two brass screws, slight warm-light glow.
> The words "IRISH RUMMY" are the only text. + style block

## 15. `buy-token.png` — the buy chip
**Square, 512×512, transparent background.**

> A single brass poker chip with an embossed shamrock in the center and a rope
> pattern around the rim, viewed straight on, slight warm metallic shine.
> + style block

---

### After you generate them
1. Put every file in `client/public/art/` (create the folder), names exactly as above.
2. `table-surface.jpg` and `page-bg.jpg` take effect on the next build — nothing else needed.
3. Send the rest to me (or just say they're in the folder) and I'll wire in the
   card back, joker, court crests, avatars, logo, and buy chip — the mechanics
   and top-down layout won't change.

**Tips for Images 2.0:** generate 2–4 variations per prompt and pick the most
consistent set; if a result drifts from the palette, add "muted colors, limited
palette" to the prompt; for the transparent ones, ask for "isolated on
transparent background" if the first try comes back with a backdrop.

---

## September 2026 total refresh — implemented version two

The refresh replaces the wood-framed interface with warm ivory, deep pine, and muted brass. All original artwork remains in place. New references and design decisions are in `design/refresh-2026-09/DESIGN.md`.

Generation used the built-in Image Gen tool. It does not expose a model selector, so the output is not claimed to be pinned to Images 2.5. The user-requested Images 2.5 models were researched separately, including the official [Sunburst model documentation](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst).

### Lobby concept — `design/refresh-2026-09/lobby-concept.png`

> Use case: ui-mockup. Create one polished high-fidelity desktop primary screen concept for Irish Rummy, a real family card-game web app, redesigned for Aunt Peggy's warm lake-house card nights. Exact 1536x1024 landscape layout. Visual direction: warm ivory page #f4f1e8, deep pine ink #203d34, muted brass #af8e50, editorial Georgia-like serif large headings, clean small sans-serif UI, ample intentional whitespace, crisp 1px rules, modest 8px corners. Not a casino. Top minimal header: small typographic 'Irish Rummy' left and 'How to play' right. Primary screen lobby: two-column content. Left 54% large beautiful hand-painted vintage travel-poster illustration in a vertical rectangular frame: sunlit cedar cottage beside a peaceful northern lake, pines, small dock with two Adirondack chairs, warm cream sky, vintage grain, graceful shapes, no lettering. Right 46% usable lobby UI: heading 'A seat for everyone.' at 48px serif; supporting copy 'Welcome back, John. Gather the family or deal a practice hand.' Then one clean section headed 'Start a family game', an outlined input with placeholder 'John’s game', and deep pine button 'Create game'. Below fine line separator, heading 'Have a room code?', outlined code input 'ABCDE' and button 'Join game', quiet text link 'Watch instead'. Below a fine separator and 'Your tables' with one compact list row 'Sunday at the lake' and secondary 'Round 3 · Peggy, John, Mary', outlined button 'Rejoin'. Footer subtle text link 'Practice with bots'. No cards surrounding each section, no extra tags or badges, no fake statistics. All UI controls/code text will be recreated with real HTML, illustration will be generated separately. Full primary screen with sensible margins and all functions visible, no scrolling mockup, no device frame, no perspective, no watermark.

### Gameplay concept — `design/refresh-2026-09/game-concept.png`

> Use case: ui-mockup. One polished high-fidelity full live gameplay screen concept for Irish Rummy, a family card game at Aunt Peggy's lake house. Landscape 1536x1024, flat screen without device frame. Style: warm ivory #f4f1e8 outer page, deep pine #203d34 ink and wide central playing field #294e41, muted brass #af8e50 fine accents, Georgia-like editorial serif headings, readable clean sans-serif UI labels; crisp 1px rules and modest 8px corners. Minimal top header: 'Irish Rummy' left, room 'Sunday at the lake · PINE5', right small text buttons 'Rules', 'Scores', 'Sound', 'Leave'. Next a compact cream horizontal player rail with four circular illustrated woodland-animal avatar portraits, player names Peggy, John, Mary, Tom and small card counts and scores. Main center deep pine playing field: top-left clear 'Round 3 of 7', second line '2 straights'; center two large cream playing cards, one deep-pine and brass illustrated lake motif card-back (draw deck), one 7 of hearts (discard), with short labels 'Deck · 58' and 'Discard'. To right small unobtrusive Buy/Pass controls. No wooden framing. Subtle low-contrast thin brass oval near outer playfield margin, ample empty playing space below deck for melds, simple no-meld text 'The table is yours.' Lower cream hand band full width: clear 'Your turn. Draw a card to begin.' centered above; hand title 'Your hand' left and 'Sort by suit' / 'Sort by rank' right, 11 sharp readable classic playing cards aligned in a slightly overlapping neat straight row; beautiful navy/brick red suit pips and cream card faces, small vintage lake wildlife court emblems. No silly emoji buttons, no gradients/glows, no dashboard metrics, no decorative labels. Real game controls remain code-native. Complete functional primary screen and legible calm hierarchy.

### Hero — `client/public/art/lake-house-v2.png`

> Use case: illustration-story. Asset type: production hero illustration for Irish Rummy family lake-house card game website, vertical 4:5 composition at 1024x1280. A beautiful nostalgic hand-painted vintage national-park travel-poster style illustration, richly but softly textured, clear graceful shapes, mature sophisticated taste. Sunny cedar cottage partially visible along left edge, mature pine trees upper and left foreground, still blue northern lake receding to soft pine-covered hills; small wooden dock at lower center with two deep pine-green Adirondack chairs facing the water, small old canoe along right foreground, a few wildflowers near cottage. Warm ivory cream clouds, muted blue-green lake and dark pine trees, honey cedar and muted brass yellow sunshine. Late afternoon, welcoming and calm, family game night atmosphere. Strong composition with natural depth, human scale but no people; no type, no lettering, no logo, no framing border, no watermark, no UI. Fill the entire image. The illustration will be shown in a large straight rectangular frame without color overlay.

### Card back — `client/public/art/card-back-v2.png`

> Use case: stylized-concept. Asset type: production playing-card back for Irish Rummy family lake-house card game. Portrait 5:7 composition, perfectly flat full-bleed rectangular card-back art. Extremely elegant premium vintage deck design. Solid very deep pine green #203d34 background, delicate muted brass gold ink linework #b79a60. Double fine-line border inset 6% from edges, tiny simple curled leaf ornaments in corners. Central symmetric elongated medallion with loon gliding on still lake water, small pine tree forest and cedar lakeside cabin; mirrored rotational 180-degree composition, two-way card back. Minimal detailed engraved illustration within medallion, restrained old-fashioned charm. Matte printed paper grain extremely subtle. No text, no digits, no letters, no logos, no watermark, no white outside border, no perspective, no mockup, no shadow, no rounded-corner cutout; full-bleed straight rectangle only.
