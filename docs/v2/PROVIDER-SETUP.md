# Google sign-in and deployment gates

Status on September 13, 2026: Google is enabled in the dedicated Supabase project, and an actual Google sign-in returned successfully to the local app's personal My games page. Profile avatar changes survived reload. A private local table was created and its invitation copied. Production Google sign-in, release deployment, and game migration are still pending. No new paid subscription was purchased.

The dedicated Google Cloud project `irish-rummy` (project number `749955563373`) and Google Auth consent configuration exist. The owner approved My Billing Account 1 for sign-in only, with no paid cloud resources enabled, and approved the Google API Services User Data Policy. The owner created `Irish Rummy Web` and entered its credentials directly into Supabase. The coordinator independently verified Google Enabled, saved the exact redirect allowlist below, and configured the app with the public Supabase URL and publishable key. No OAuth secret was copied into chat or Git.

## Provider values

- Supabase project: `irish-rummy`, reference `djsgajbcrydzcbktzemc`.
- Project URL: `https://djsgajbcrydzcbktzemc.supabase.co`.
- Google OAuth callback: `https://djsgajbcrydzcbktzemc.supabase.co/auth/v1/callback`.
- App origin: `https://irishrummy.com` (recheck the canonical host at production deployment).
- Local preview origin: `http://127.0.0.1:3051`.
- Supabase redirect allowlist: the exact app root `https://irishrummy.com/` and local preview `http://127.0.0.1:3051/`. Add any actual development origin explicitly; no broad production wildcard.
- Scope: Google identity only (`openid`, `email`, `profile`). No mail, contacts, Drive or calendar access.

## Owner setup

1. Use a dedicated Google Cloud project for Irish Rummy so its consent screen does not use another app’s name. Set Google Auth branding to Irish Rummy, select the owner’s support/contact email, and configure an external audience. No paid Google compute is needed for an OAuth client. Check the actual audience and basic-sign-in scope rules before inviting family broadly; the successful owner sign-in alone does not prove every family account can enter.
2. Create a Web OAuth client. Add the app origins and exact Supabase callback above. Credential creation and secret entry must be completed by the account owner in the browser. Do not put the secret in chat or Git.
3. In [Supabase’s Google provider](https://supabase.com/dashboard/project/djsgajbcrydzcbktzemc/auth/providers?provider=Google), enter that client ID and secret, enable Google, and save. Leave nonce checks enabled and the email requirement enabled.
4. Set Supabase Auth Site URL and exact redirect URLs. Obtain the project’s public publishable key and set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the server/local environment. These are intentionally public runtime config; a service-role/secret key is rejected. The database URL stays server-only.
5. Verify real Google login, callback, refresh, sign-out, another Google account, invitation join, membership isolation and same-seat return on a different device. Local mocked-provider tests do not establish these live outcomes.

## Database and host

The coordinator verified the live dedicated Supabase connection using TLS and the project's CA certificate, then applied `server/db/002-account-state.sql` on September 13. The constraint now accepts snapshot version 3; the table contained zero snapshots both before and after. The migration only widens the existing private snapshot constraints; it does not expose a Data API or change grants. No production game state has been imported and the production state key has not been initialized.

Preserve/import the existing Render disk snapshot using `CUTOVER.md` before choosing the production state key. Never bootstrap an empty database over live family rooms. A fresh request to `https://irishrummy.com/healthz` returned `ok: true`, `persistenceEnabled: true`, and seven rooms; it did not identify the storage backend or verify v2 deployment.

Use one Node/Socket.IO server. Keep a copy of the pre-v2 snapshot with its old binary for rollback; an old server must not overwrite a v3 snapshot. After deployment, verify health and save/restart/rejoin on the actual host before calling persistence shipped.

## Incremental cost

[Supabase Free](https://supabase.com/pricing) includes 50,000 monthly active users and 500 MB of database storage, but may pause after one week of inactivity. This is relevant to family games with long gaps. Its Pro plan is $25/month and exceeds the requested under-$15 new-cost target by itself. The inspected organization is Free; no paid Supabase plan has been assumed.

[Render Starter](https://render.com/pricing) is $7/month. The live Irish Rummy service was inspected on that selected $7/month compute plan, with an existing 1 GB disk at `/var/data`. Reuse that existing paid service and exclude it from new costs as requested. Reuse existing hosting where possible; do not claim an always-on free Supabase deployment or buy Pro without resolving the budget.

Primary setup references: [Supabase Google Auth](https://supabase.com/docs/guides/auth/social-login/auth-google), [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## Live host inspection

Read-only Render inspection verified service `srv-d953gfu7r5hc73dvnnbg`, Ohio, tracked branch `main`, and deployed SHA `707d0de679a7989557a883161d7911d111283d31`. The start command is `node server/src/index.js`; the build command installs/builds the client and installs server dependencies. The 1 GB disk remains attached at `/var/data`; disk services do not support horizontal scaling. No live configuration or deployment was changed during this inspection.
