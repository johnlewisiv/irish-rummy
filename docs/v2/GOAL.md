# Irish Rummy v2 completion contract

## Outcome

A private, phone-first family card game: Google sign-in, personal profiles, invitation-based shared games listed only for their members, durable recovery, clearer buying/passing, a deliberately illustrated retro lake-house table with walnut tones with the accepted traditional cards, flat retro screen-print generated avatar choices, and renamed bots. Keep Peggy only in a discreet optional origin note. Do not include the personal medical history in the product or project artifacts. No App Store work in this scope.

## Verification

Production build; authentication and membership regression tests; cross-account isolation and invitation tests; saved-game and legacy-claim recovery; real Google sign-in where provider setup permits; browser interaction tests at small phone and desktop sizes; generated concept vs implementation screenshots and written fidelity audit. Verify provider billing before reporting incremental recurring costs. Target under $15/month new fees; existing paid services excluded.

## Boundaries and constraints

Use this project and its existing GitHub review branch, configured Supabase project, and existing hosting accounts. Preserve old artwork, legacy saves, existing production rooms, and private secrets. No room is public by default. Account identity must be verified on the server; hiding a lobby is not access control. Never infer ownership from a display name or email supplied by the browser. No production cutover until live legacy saves can be preserved and imported safely.

## Iteration policy

Root coordinates all agents and resolves their findings. Work in parallel on server authorization, client account flows, gameplay usability, and design/provider setup; use additional focused review passes after implementation. Inspect results, fix failures, and choose the highest-signal remaining verification. Keep an auditable list of shipped vs local-only vs provider-blocked work.

## Blocked stop condition

If a provider action requires account-owner credentials or consent, prepare the exact configuration first, identify the specific remaining step, and continue independent implementation/verification. Do not claim live sign-in, deployment, or migration from a prepared form or passing local tests.
