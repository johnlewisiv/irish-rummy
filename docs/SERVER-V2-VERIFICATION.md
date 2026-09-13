# Private accounts and durable decisions

The server verifies Google sign-in with Supabase Auth's authenticated `/auth/v1/user` response. A browser-supplied account ID, name, JWT payload, or email is never identity proof. Every subsequent socket action checks session expiry. The browser refreshes its Supabase session and sends another `hello` before continuing.

Configuration: set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the game server. `SUPABASE_ANON_KEY` is a legacy public-key fallback. The browser receives only the public URL/key from `/auth/config`. Missing configuration leaves isolated practice available and rejects shared-game creation. Secret/service-role keys are never accepted for the public configuration endpoint.

Source references: [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Ownership and invitations

- Profiles, room membership, invitation secrets, hands, and decisions commit atomically in the existing private snapshot. The Supabase Data API remains unnecessary.
- `rooms:list` lists only the account's own tables. Nonmembers cannot gain a seat or spectate using the short table code alone. A signed-in newcomer may request a seat; only the host sees the opaque request and may approve it. Pending requests and approved memberships commit durably before acknowledgement. Existing members can reopen directly by code. The host retrieves or rotates a random 256-bit invitation; possession plus Google sign-in grants membership. Rotation prevents new joins through the old link and preserves existing members.
- A guest can create and reopen only its isolated practice table. Guests cannot invite others or join shared games.
- `profile:claimLegacy {token}` requires a signed-in account plus an explicitly selected old saved-player token. It keeps the original internal seat and deck identities, binding account ownership rather than reconstructing the hand. A token already claimed by another account is rejected. Existing saves are never automatically claimed by name.
- Google photo sharing is opt-in. Other players receive neither email addresses nor account IDs; optional photos and generated-avatar choices are public only within their own table.

## Buying

Every discard has a persisted random `buyDecisionId`. Draw, buy, pass, cancel, pause, and resume requests must carry that ID; a delayed tap cannot apply to a later discard. Timer expiry freezes further buying even when the current player is still choosing a pile. Players who have no buys remaining cannot hold up the deck draw. The current player still has first choice of the discard.

The personalized `buyReceipt` persists the decision, visible card, outcome, winning buyer when relevant, and timestamp. It survives restart so the interface can explain what actually happened after a reconnect. The pending deck draw is explicitly exposed in the view.

New tables default to a 30-second buy window. Existing saved settings remain unchanged. Bot difficulty IDs and playing strength stay unchanged; display names are Riley, Morgan, Casey, and Jordan. Old avatar IDs are accepted as aliases for the six lake-house illustrations.

## Migration and deployment boundary

Apply `server/db/001-game-state.sql` and then `server/db/002-account-state.sql` before running this server against Postgres. The second migration permits snapshot version 3 and requires its accounts array. Old server binaries reject version 3, preventing a rollback from silently discarding membership. No new public privileges or new tables are introduced. Back up existing production games and follow the existing cutover/import procedure before deploying; this document is not evidence of a live cutover.

## Local verification

The `server/test/accounts.test.js` tests use synthetic Google identities, the actual Supabase verification code with a fake HTTP response, real local Socket.IO connections, and the actual durable queue. They cover spoofed/non-Google/expired credentials, private listing and unauthorized code-only access denial, durable host-approved code requests and failed-save isolation, invite rotation, unauthorized spectators and host actions, guest isolation, opt-in photos, explicit legacy claim and cross-account denial, exact hand/seat recovery, stale taps, durable buy receipts, expired windows, and exhausted buyers.

Existing engine, room, persistence, durable-save-failure, timer, and complete self-play checks remain part of `npm --prefix server test`. The older `tests/socket-recovery.test.mjs` fixture explicitly injects legacy protocol compatibility so it continues verifying pre-account saves; the shipped server entry point never enables that compatibility option. `tests/database.test.js` applies both real SQL migrations twice against PGlite and checks private privileges, revision conflicts, and persisted recovery.
