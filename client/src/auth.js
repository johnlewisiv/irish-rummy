// Supabase owns OAuth, session persistence, refresh locking, and cross-tab events.
// Only the game server decides whether an access token may read or change a game.
export function createAuthController({ loadConfig, makeClient }) {
  let client;
  let session = null;
  let initialization;
  let subscription;
  let sessionRevision = 0;
  // A delayed refresh or provider event must not reopen private data after the
  // player signs out, including when provider sign-out fails while offline.
  let locallySignedOut = false;
  let state = { loading: true, enabled: false, user: null, error: null, sessionVersion: 0 };
  const listeners = new Set();
  const update = (changes) => {
    state = { ...state, ...changes };
    for (const listener of listeners) listener({ ...state });
  };
  const setSession = (next) => {
    if (locallySignedOut && next) return;
    sessionRevision += 1;
    const changed = session?.access_token !== next?.access_token;
    session = next;
    update({ user: next?.user || null, loading: false, error: null,
      sessionVersion: state.sessionVersion + (changed ? 1 : 0) });
  };
  function initialize() {
    if (initialization) return initialization;
    initialization = (async () => {
      try {
        const config = await loadConfig();
        if (!config.enabled) { update({ loading: false, enabled: false }); return; }
        if (!config.url || !config.publishableKey) throw new Error('Google sign-in is not configured yet.');
        const url = new URL(config.url);
        if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Google sign-in needs a secure connection.');
        client = await makeClient(config.url, config.publishableKey, {
          auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true,
            detectSessionInUrl: true, storageKey: `rummy.auth.${url.hostname}.v1` },
        });
        update({ enabled: true });
        // Keep this callback synchronous: SDK calls made inside it can deadlock.
        subscription = client.auth.onAuthStateChange((_event, next) => setSession(next)).data.subscription;
        const revision = sessionRevision;
        const { data, error } = await client.auth.getSession();
        if (revision !== sessionRevision) return;
        if (error) throw error;
        setSession(data.session);
      } catch (error) {
        update({ loading: false, error: error?.message || 'Sign-in could not be loaded. Please try again.' });
      }
    })();
    return initialization;
  }
  return {
    initialize,
    getState: () => ({ ...state }),
    subscribe(listener) { listeners.add(listener); listener({ ...state }); return () => listeners.delete(listener); },
    async signIn(redirectTo) {
      await initialize();
      if (!client) throw new Error(state.error || 'Google sign-in is not available yet.');
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo, queryParams: { prompt: 'select_account' },
      } });
      if (error) throw error;
    },
    async getAccessToken() {
      await initialize();
      if (!client || locallySignedOut) return null;
      const revision = sessionRevision;
      const { data, error } = await client.auth.getSession();
      if (locallySignedOut) return null;
      if (revision !== sessionRevision) return session?.access_token || null;
      if (error) throw error;
      return data.session?.access_token || null;
    },
    async refresh() {
      if (!client || locallySignedOut) return null;
      const revision = sessionRevision;
      const { data, error } = await client.auth.refreshSession();
      if (locallySignedOut) return null;
      if (revision !== sessionRevision) return session?.access_token || null;
      if (error) throw error;
      setSession(data.session);
      return data.session?.access_token || null;
    },
    async signOut() {
      // Hide private data immediately, including when the network is unavailable.
      locallySignedOut = true;
      setSession(null);
      if (!client) return;
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new Error('Your game is hidden, but sign-out could not finish. Reconnect and sign out again before sharing this browser.');
    },
    dispose() { subscription?.unsubscribe(); listeners.clear(); },
  };
}

let controller;
export function getAuth(basePath = '') {
  if (!controller) controller = createAuthController({
    loadConfig: async () => {
      const response = await fetch(`${basePath}/auth/config`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Sign-in settings could not be loaded. Please try again.');
      return response.json();
    },
    makeClient: async (...args) => {
      const { createClient } = await import('@supabase/supabase-js');
      return createClient(...args);
    },
  });
  return controller;
}
