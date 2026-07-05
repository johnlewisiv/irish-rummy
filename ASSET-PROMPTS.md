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
