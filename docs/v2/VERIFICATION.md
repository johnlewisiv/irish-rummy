# Irish Rummy v2 verification

Local checks below were completed September 13, 2026 after the Mac restart. The subsequent approved production deployment, seven-game migration, and real owner Google callback are recorded in [the live release evidence](RELEASE-2026-09-13.md). Historical local-only statements below describe those earlier checks, not the current release status.

## Automated checks

The unified `npm test` command passed in the isolated `.runtime-v2` workspace. It now runs the complete client test suite rather than only the original session tests.

| Check | Result and evidence |
| --- | --- |
| Server rules, engine, rooms, persistence, durable writes, and buy windows | All assertions passed. Covered joker swaps and required joker use, buying penalties and priority, layoff validation, three-buy limits, pause/resume, stale timers, serialized saves, rollback, corruption refusal, and outage recovery. |
| Bot simulations | Complete two-, four-, and five-player games passed deck-integrity checks. |
| Account and authorization tests | 11 passed using synthetic Google identities and real local sockets. Covered verified identity, rejected invalid/expired tokens, account isolation, private invitation rotation, unauthorized code-only/spectator denial, host-approved code requests, durable pending/approved recovery, opaque host-only queues, photo opt-in, failure-before-approval isolation, isolated guest practice, explicit legacy claims, restart recovery, stale decision rejection, and private chat access. |
| Client tests | 39 passed. Covered PKCE configuration, session refresh/sign-out, account-scoped restoration, invitation fragments and redirect storage, failed durable identity saves, held draws, buy/pass priority, mandatory decisions, joker restrictions, and reconnect/save states. The final six regressions also cover delayed provider events and a refresh already in flight after sign-out, practice setup cancellation between saved steps, and failed/uncertain practice saves without replay. |
| Database and socket recovery | 5 passed. The SQL schema ran against local PGlite: private state access and stale-writer rejection passed. Real sockets preserved exact hands, buying state, chat, seats, and reconnect behavior; uncertain writes were not replayed, and failed/uncertain saves recovered authoritative state. |
| Production client build | Passed after the final account-boundary, practice setup, external busy/leave/chat guards, retro art, acknowledgement, expert-bot disclosure, and small-phone target updates. Vite transformed 121 modules without missing-art warnings; the final build took 40.65 seconds. Every referenced art file was found in the output and matched its runtime source bytes. |

The final unified run passed 55 Node test-runner tests (11 account, 39 client, 5 database/recovery), plus all standalone server assertions and the three complete bot simulations. The commands were `npm test` and `npm --prefix client run build`, run from `.runtime-v2`.

Socket tests require permission to listen on localhost outside the filesystem sandbox. They use synthetic identities and isolated state; this pass did not read `.env`, connect to the live Supabase database, or change provider settings.

## Bugs corrected during verification

- New private chat messages previously used an unconditional room broadcast, while game-state updates checked membership and session expiry. A regression test demonstrated that an expired account could still receive chat. Delivery now checks the same access predicate; the test also verifies that a legacy guest stops receiving chat after the seat is claimed by an account.
- A multiplayer test read the second browser immediately after the host's start acknowledgement. Since those are different sockets, the second browser could still hold its lobby snapshot. The test now completes a second-browser round trip before inspecting its started game; the unified suite passes with that synchronization.

- The app's sign-out boundary now rejects delayed provider session events and token/refresh results after local sign-out. Tests verify that those late callbacks cannot restore the controller’s signed-out account or expose an access token.
- Practice setup now stops between every saved server step when the player changes account, leaves, or opens another table. A failed or uncertain step ends the sequence without replay. The waiting/game/chat controls also honor the app's setup lock, preventing manual mutations or leaving while the practice table is being prepared.
- The game screen is keyed by identity and room. Changing tables remounts local hand selections, staging, invitation, and dialog state; old room chat is cleared as the new room arrives.

## Final source and build parity

All files in `client/src`, the client package manifests, `index.html`, and `vite.config.js` matched the isolated runtime before the final build. The coordinator's final `GameScreen.jsx` and `ChatPanel.jsx` were copied into the runtime explicitly; no other mismatching file was overwritten.

The active art also matched: `lake-avatars-retro-v2.png`, `walnut-retro-v2.png`, `court-royals-v3.png`, and `card-back-v3.svg`. The built bundles reference those four plus the retained CSS reference to `card-back-v2.png`; all five files exist in `client/dist/art` and match their runtime source bytes.

Ten older source art files are absent from the trimmed runtime: `court-jack.png`, `court-king.png`, `court-queen.png`, `felt-wood.png`, `felt.jpg`, `lake-avatars-v2.png`, `lake-house-v2.png`, `logo.png`, `page-bg.jpg`, and `table-surface.jpg`. None is referenced by the current frontend source, entry HTML, or Vite configuration. The original source files remain intact.

Final generated bundles: `index-CyoDOSMN.css`, `index-DQRcZgxZ.js`, and `index-WBCh6DDP.js` in `.runtime-v2/client/dist/assets`. The coordinator owns restarting the preview and checking the rendered result.

## Preview runtime

The ignored `.runtime-v2` directory preserves the preview workspace across restarts. Fresh dependencies are kept in its `dependencies.nosync` cache to avoid the observed iCloud offloading of newly installed packages. The original disposable dependency directories are retained with an `offloaded-20260913` suffix. No existing project saves or `.env` credentials were moved or changed.

The coordinator owns the running preview and its final restart. Its saved practice room remains at `.runtime-v2/.data/v2-preview-rooms.json`.

The server module successfully imported after switching to the cached dependencies. The final built preview is in `.runtime-v2/client/dist`. The coordinator restarted it with the server authorization fix and verified saved-hand recovery; subsequent timer migration changes passed their own regression suite.

## Final rollout review follow-up

The host runtime now requires Node 22, matching the installed Supabase SDK and the verified local runtime. A regression found that a suspended, unpaused buy window lost its saved remaining time during import/startup serialization. The corrected serializer retains `remainingMs` when no live expiry exists. The new regression preserves a complete game snapshot and both paused/unpaused 12,345 ms windows through legacy normalization and two durable startup rewrites, then verifies resuming the saved interval. The focused check and full server suite passed after this change.

The coordinator restarted the preview, verified the same hand and turn in the browser, and recorded rendered checks in `VISUAL-REVIEW.md`. The live dedicated Supabase connection and version-3 schema update were also verified, with zero saved snapshots before and after. No production games have been imported.

## Remaining release evidence

- Real Google sign-in succeeded locally with the owner account. The callback opened My games; an avatar change survived reload, and private-table creation and invitation copying succeeded. Production callback, family-account access and a second real device still require verification.
- No production deployment, live-room migration, database cutover, or billing upgrade was performed in this verification pass.
- Rendered phone/desktop checks and generated-art fidelity are recorded separately in `VISUAL-REVIEW.md`; real devices and live account flows remain release checks.

## Invitation and import follow-up

Short codes now create a private request for host approval; existing members reopen directly. Requests and approved seats survive restart, only the host sees an opaque request queue, and failed writes do not grant membership. Full canonical import verification now compares every saved value, including hands, decisions, timers, ownership and chat; a matching room count alone is insufficient. These regressions passed in the full server suite.

## Final invitation and account race regressions

All 39 client tests passed after fixing same-document invitation capture, invitation precedence over an older remembered room, and stale account responses. The invitation secret is saved in the tab before the fragment is cleared, so the Google redirect preserves the join choice. An old initialization/refresh/token-read response cannot override a newer account or cross-tab sign-out. Pending code approvals pause while a Profile or New game draft is open. All 26 frontend source files match the tested runtime.

The coordinator additionally verified same-document invitation navigation, sign-out hiding private games, real Google return preserving the invitation, explicit joining, and existing-member short-code reopening in the rendered local app. Browser warning/error logs were empty. The final copy-link usability adjustment was rebuilt successfully with 121 modules.

## Post-cutover dependency patch

Client `socket.io-parser` was narrowly updated from 4.2.6 to 4.2.7: only its version, resolved URL and integrity changed in the lockfile. All 39 client tests passed. A bounded regression confirmed rejection of malformed zero-attachment frames while valid JSON/binary events round-trip. The production dependency audit reports zero vulnerabilities. The build passed with 121 modules, producing `index-eoe-7fBv.js`, `index-WBCh6DDP.js` and `index-CyoDOSMN.css`; source/runtime parity and active art were verified. Six development/build-tool audit findings remain separate from the shipped dependency graph. Deployment of this patch is recorded in the release evidence when verified.
