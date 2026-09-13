import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthController } from './auth.js';

function fixture({ enabled = true, signOutError = null } = {}) {
  let authEvent;
  let current = { access_token: 'private-test-access', user: { id: 'account-one' } };
  const calls = [];
  const client = { auth: {
    onAuthStateChange: (callback) => { authEvent = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    getSession: async () => ({ data: { session: current } }),
    refreshSession: async () => ({ data: { session: current } }),
    signInWithOAuth: async (options) => { calls.push(options); return {}; },
    signOut: async (options) => { calls.push(options); return { error: signOutError }; },
  } };
  const controller = createAuthController({
    loadConfig: async () => ({ enabled, url: 'https://test-project.supabase.co', publishableKey: 'public-test-key' }),
    makeClient: async (...options) => { calls.push(options); return client; },
  });
  return { controller, calls, event: (session) => { current = session; authEvent('TOKEN_REFRESHED', session); } };
}

test('one initialized SDK owns PKCE, persistence, refresh, and opaque token access', async () => {
  const { controller, calls } = fixture();
  await Promise.all([controller.initialize(), controller.initialize()]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].auth.flowType, 'pkce');
  assert.equal(calls[0][2].auth.autoRefreshToken, true);
  assert.equal(calls[0][2].auth.persistSession, true);
  assert.equal(controller.getState().user.id, 'account-one');
  assert.equal(JSON.stringify(controller.getState()).includes('private-test-access'), false);
  assert.equal(await controller.getAccessToken(), 'private-test-access');
});

test('token refresh and account changes notify without exposing tokens in UI state', async () => {
  const { controller, event } = fixture();
  await controller.initialize();
  const before = controller.getState().sessionVersion;
  event({ access_token: 'fresh-private', user: { id: 'account-one' } });
  assert.equal(controller.getState().sessionVersion, before + 1);
  event({ access_token: 'another-private', user: { id: 'account-two' } });
  assert.equal(controller.getState().user.id, 'account-two');
  event(null);
  assert.equal(controller.getState().user, null);
});

test('Google starts an account chooser and returns to the explicit app base', async () => {
  const { controller, calls } = fixture();
  await controller.signIn('https://rummy.example/rummy/');
  assert.deepEqual(calls[1], { provider: 'google', options: { redirectTo: 'https://rummy.example/rummy/', queryParams: { prompt: 'select_account' } } });
});

test('sign-out hides private state immediately even when provider sign-out fails', async () => {
  const { controller } = fixture({ signOutError: new Error('Offline') });
  await controller.initialize();
  const pending = controller.signOut();
  assert.equal(controller.getState().user, null);
  await assert.rejects(pending, /sign-out could not finish/);
});

test('unconfigured provider cannot create a pretend authenticated session', async () => {
  const { controller, calls } = fixture({ enabled: false });
  await controller.initialize();
  assert.equal(calls.length, 0);
  assert.equal(controller.getState().enabled, false);
  assert.equal(controller.getState().user, null);
  await assert.rejects(controller.signIn('https://rummy.example/'), /not available/);
});


test('provider events and token reads cannot reopen an account after failed sign-out', async () => {
  const { controller, event } = fixture({ signOutError: new Error('Offline') });
  await controller.initialize();
  await assert.rejects(controller.signOut(), /sign-out could not finish/);
  event({ access_token: 'late-refresh', user: { id: 'account-one' } });
  assert.equal(controller.getState().user, null);
  assert.equal(await controller.getAccessToken(), null);
  assert.equal(await controller.refresh(), null);
});

test('a refresh already in flight cannot undo a later sign-out', async () => {
  let resolveRefresh;
  const current = { access_token: 'before-sign-out', user: { id: 'account-one' } };
  const controller = createAuthController({
    loadConfig: async () => ({ enabled: true, url: 'https://test-project.supabase.co', publishableKey: 'public-test-key' }),
    makeClient: async () => ({ auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: current } }),
      refreshSession: () => new Promise((resolve) => { resolveRefresh = resolve; }),
      signOut: async () => ({}),
    } }),
  });
  await controller.initialize();
  const pending = controller.refresh();
  await controller.signOut();
  resolveRefresh({ data: { session: { ...current, access_token: 'late-refresh' } } });
  assert.equal(await pending, null);
  assert.equal(controller.getState().user, null);
});

function delayedSessionFixture() {
  let authEvent;
  let resolveRead;
  let resolveRefresh;
  const controller = createAuthController({
    loadConfig: async () => ({ enabled: true, url: 'https://test-project.supabase.co', publishableKey: 'public-test-key' }),
    makeClient: async () => ({ auth: {
      onAuthStateChange: (callback) => { authEvent = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: () => new Promise((resolve) => { resolveRead = resolve; }),
      refreshSession: () => new Promise((resolve) => { resolveRefresh = resolve; }),
    } }),
  });
  return { controller, event: (session) => authEvent('SIGNED_IN', session),
    readPending: () => Boolean(resolveRead),
    finishRead: (session) => { const resolve = resolveRead; resolveRead = null; resolve({ data: { session } }); },
    finishRefresh: (session) => resolveRefresh({ data: { session } }),
  };
}
const oldAccount = { access_token: 'synthetic-old-account', user: { id: 'old-account' } };
const newAccount = { access_token: 'synthetic-new-account', user: { id: 'new-account' } };

test('an older initialization result cannot replace a newer account event', async () => {
  const f = delayedSessionFixture();
  const initializing = f.controller.initialize();
  while (!f.readPending()) await Promise.resolve();
  f.event(newAccount);
  f.finishRead(oldAccount);
  await initializing;
  assert.equal(f.controller.getState().user.id, 'new-account');
});

test('an older refresh cannot replace a newer account or cross-tab sign-out', async () => {
  const f = delayedSessionFixture();
  const initializing = f.controller.initialize();
  while (!f.readPending()) await Promise.resolve();
  f.finishRead(oldAccount); await initializing;
  const refresh = f.controller.refresh();
  f.event(newAccount);
  f.finishRefresh(oldAccount);
  assert.equal(await refresh, newAccount.access_token);
  assert.equal(f.controller.getState().user.id, 'new-account');
  const nextRefresh = f.controller.refresh();
  f.event(null);
  f.finishRefresh(newAccount);
  assert.equal(await nextRefresh, null);
  assert.equal(f.controller.getState().user, null);
});

test('a token read already in flight cannot authenticate the previous account after an account event', async () => {
  const f = delayedSessionFixture();
  const initializing = f.controller.initialize();
  while (!f.readPending()) await Promise.resolve();
  f.finishRead(oldAccount); await initializing;
  const reading = f.controller.getAccessToken();
  while (!f.readPending()) await Promise.resolve();
  f.event(newAccount);
  f.finishRead(oldAccount);
  assert.equal(await reading, newAccount.access_token);
  assert.equal(f.controller.getState().user.id, 'new-account');
});
