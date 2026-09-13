# Irish Rummy v2 visual and interaction review

Reviewed September 13, 2026 against the built local preview. This is local QA, including a real Google sign-in. It is not evidence of a deployed release.

## Art direction

Flat retro lake-house illustration: warm walnut brown, pine green, ivory paper, muted teal and orange. The generated imagery uses simplified shapes and printed grain rather than photographic lighting. Traditional playing cards remain the user's accepted design. The six profile illustrations are canoe, dock, cabin, lantern, sailboat, and coffee.

Generated with the built-in image generation tool. Prompts and generation mode are recorded in `design/v2/retro-prompts.json`; the tool did not expose a model-version selector. OpenAI announced [ChatGPT Images 2.5](https://openai.com/index/introducing-chatgpt-images-2-5/) on September 8, 2026. The available generation tool did not report a pinned model version, so the artwork is not claimed as a verified model-specific output. Current assets are `client/public/art/lake-avatars-retro-v2.png` and `client/public/art/walnut-retro-v2.png`. Earlier artwork is preserved and unused.

## Concept fidelity

Reference: `design/v2/game-phone-retro-concept.png`.

| Visual anchor | Implementation and reason |
| --- | --- |
| Illustrated walnut surround | Generated flat wood pattern frames the game; no photographic table texture. |
| Circular lake-house portraits | Six consistent illustrated subjects replace the old character avatars. Profile photos from Google are an explicit optional choice. |
| Green playing area | A restrained flat pine surface gives the cards contrast. Intentional change from the concept's textured felt to respect the non-photorealistic request. |
| Traditional card faces | Existing rank/pip/court rendering remains. Intentional change from the generated mockup's inaccurate pips: actual card identity must always be correct. |
| One ivory decision area | Draw, buy/pass, requested/waiting, result, and discard guidance occupy the same location above the hand. No duplicate buy sidebar or competing banner. |
| Equal buy and pass targets | A named discard, visible penalty and remaining buys, plus Pause/Resume. Buttons remain large enough for touch. |
| Ivory hand tray | Horizontally scrollable cards, exposed rank/suit corners, one Sort menu, and selection feedback. |
| Quiet header and compact players | Room name, return control, and menu; current-turn ring, hand counts, and round contract carry useful information. Portraits are smaller than the concept to leave room for real melds. |

The earlier account-home concept's decorative plant/book props were intentionally omitted. Personal tribute text appears only inside the optional About disclosure. The user's personal medical context is excluded from the product and project artifacts.

## Why each element remains

- Player portraits and turn ring identify whose turn it is without relying on color alone; names and action copy also identify the player.
- Deck, discard, and laid-down melds are the shared game state needed to choose a move.
- The round contract explains what to collect, without requiring the rules dialog each turn.
- The decision area explains the current required choice, its cost, and whether it was saved or is waiting.
- Sorting and meld staging support hand organization and going down. Staging replaces the ordinary action area while preserving the hand.
- Scores, rules, history, chat, sound, auto-pass, and host controls live in the menu because they are useful occasionally.
- Invitation and profile controls belong in the account/lobby workflow. Private games do not appear in a public browser.

## Rendered checks

- **390 × 844:** table, draw/buy/pass area, and hand are visible together. Melds scroll within the mat and cards scroll within the hand. Staging remains usable without hiding the hand.
- **320 × 568:** no horizontal page overflow. The very short screen uses a small amount of vertical page scrolling; controls and hand remain reachable. Card overlap still leaves roughly 44 px of exposed touch area.
- **1280 × 900:** no page overflow; wider hand and meld layout, same action hierarchy.
- Restarted the preview server and reloaded the browser. The same practice room, exact eleven-card hand, discard, laid-down melds, and turn returned. This exercised local file recovery, not the production Supabase cutover.
- Drew one card: hand increased to twelve and drawing disabled. Discard stayed disabled until one card was selected.
- Opened staging, added a selected card, and canceled without losing the hand. Selected a different card and discarded it.
- Paused a buy decision and bought: received the named card plus one penalty card, with a clear result. The next discard correctly replaced the older result with a fresh mandatory choice.
- Sorted by rank, paused the next decision, and passed: received explicit pass confirmation.
- Sent a synthetic message in the bot-only local practice room; the message appeared and the composer cleared after acknowledgement. Return navigation reached the sign-in screen.
- No browser errors or warnings were reported in the inspected gameplay logs. A real Google sign-in then opened the personal My games page. Changed the profile illustration to Lantern, saved, reloaded and verified the choice; restored Canoe and saved. Created a private local table and copied its invitation. The profile view was inspected at 390 × 844 with all six generated avatar choices and Google photo opt-in.

Screenshots: `screenshots/table-390.png`, `screenshots/table-320.png`, `screenshots/buy-pass-390.png`, `screenshots/staging-390.png`, `screenshots/table-desktop.png`, and `screenshots/profile-390.png`.

## Final account and invitation browser checks

The built app restored the same Google-owned private table after a local server restart. Entering its five-character code reopened the existing member seat. Opening the copied invitation in the same already-seated tab showed the invitation choice instead of silently reopening the previous table. Signed out: private games disappeared immediately while the invitation remained. Signed back in through the real Google chooser: the callback cleared its code query, My games showed the saved invitation, and Join returned to the same single host seat. Returning home cleared the consumed invitation. The inspected browser error/warning log was empty.

Invitation links remain selectable after copying so players can also share them manually. New screenshot evidence: `screenshots/private-table-390.png` and `screenshots/my-games-390.png`. These show a local test table, not live family data. Cross-account approval and ownership enforcement are covered by real local socket tests with synthetic identities; another real Google account/device was not used in this pass.
