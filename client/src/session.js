// Durable player identities with an explicit, per-tab active player.
// A saved name is a label; only its original secret token recovers a seat.
const PROFILES_KEY = 'rummy.profiles.v1';
const TOKEN_KEY = 'rummy.token';
const NAME_KEY = 'rummy.name';

function cleanName(name) {
  return String(name || '').trim().slice(0, 20);
}

function cleanCode(code) {
  return String(code || '').trim().toUpperCase();
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Storage is injectable so recovery behavior can be tested without a browser. */
export function createSessionStore({ localStorage, sessionStorage, randomToken, now = Date.now }) {
  const read = (storage, key) => {
    try { return storage.getItem(key); }
    catch { throw new Error('Browser storage is unavailable. Allow site storage to keep your player and recover your games.'); }
  };
  const write = (storage, key, value) => {
    try { storage.setItem(key, value); }
    catch { throw new Error('Your player could not be saved on this browser. Allow site storage or free some space, then try again.'); }
  };

  function load() {
    const raw = read(localStorage, PROFILES_KEY);
    if (!raw) return { version: 1, profiles: [] };
    try {
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.profiles) || data.profiles.some((p) =>
        !p || typeof p.token !== 'string' || !p.token || typeof p.name !== 'string' || !Array.isArray(p.rooms))) {
        throw new Error('Invalid saved players');
      }
      return data;
    } catch {
      // Never overwrite unreadable identity records with a new empty identity.
      throw new Error('Saved player details could not be read. Your existing browser data has been kept; do not clear it.');
    }
  }

  const save = (data) => write(localStorage, PROFILES_KEY, JSON.stringify(data));

  function migrate() {
    const data = load();
    let changed = false;
    // Preserve both older local-storage tokens and the current tab's token.
    // Do not select an old local token automatically in a different tab.
    const tokens = [read(localStorage, TOKEN_KEY), read(sessionStorage, TOKEN_KEY)].filter(Boolean);
    for (const token of new Set(tokens)) {
      if (data.profiles.some((p) => p.token === token)) continue;
      data.profiles.push({
        token,
        name: cleanName(read(localStorage, NAME_KEY)),
        currentRoomCode: null,
        roomSelectionKnown: false,
        rooms: [],
        lastUsedAt: now(),
      });
      changed = true;
    }
    if (changed) save(data);
    return data;
  }

  function listProfiles() {
    return copy(migrate().profiles).sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
  }

  function getActiveProfile() {
    const data = migrate();
    const token = read(sessionStorage, TOKEN_KEY);
    return copy(data.profiles.find((p) => p.token === token) || null);
  }

  function updateActive(update) {
    const data = migrate();
    const token = read(sessionStorage, TOKEN_KEY);
    const profile = data.profiles.find((p) => p.token === token);
    if (!profile) throw new Error('Choose your saved player or create a player first.');
    update(profile);
    profile.lastUsedAt = now();
    save(data);
    return copy(profile);
  }

  function selectProfile(token, options = {}) {
    const data = migrate();
    const profile = data.profiles.find((p) => p.token === token);
    if (!profile) throw new Error('That saved player was not found on this browser.');
    if (Object.hasOwn(options, 'roomCode')) {
      profile.currentRoomCode = cleanCode(options.roomCode) || null;
      profile.roomSelectionKnown = true;
    }
    profile.lastUsedAt = now();
    save(data);
    write(sessionStorage, TOKEN_KEY, token);
    return copy(profile);
  }

  function createProfile(name, { practiceOnly = false } = {}) {
    const n = cleanName(name);
    if (!n) throw new Error('Enter a name for your player.');
    const data = migrate();
    const token = randomToken();
    if (!token || data.profiles.some((p) => p.token === token)) throw new Error('Could not create a unique player. Please try again.');
    const profile = {
      token, name: n, currentRoomCode: null, roomSelectionKnown: true,
      rooms: [], lastUsedAt: now(),
      ...(practiceOnly ? { practiceOnly: true } : {}),
    };
    data.profiles.push(profile);
    // Write the recovery identity durably before making it active in this tab.
    save(data);
    write(sessionStorage, TOKEN_KEY, token);
    return copy(profile);
  }

  function getToken() {
    const profile = getActiveProfile();
    if (!profile) throw new Error('Choose your saved player or create a player first.');
    return profile.token;
  }

  const getSavedName = () => getActiveProfile()?.name || '';

  function saveName(name) {
    const n = cleanName(name);
    if (!n) throw new Error('Enter a name for your player.');
    return updateActive((profile) => { profile.name = n; });
  }

  function getHelloPayload() {
    const profile = getActiveProfile();
    if (!profile) throw new Error('Choose your saved player or create a player first.');
    const payload = { token: profile.token, name: profile.name };
    if (profile.currentRoomCode) payload.roomCode = profile.currentRoomCode;
    else if (profile.roomSelectionKnown) payload.rejoin = false;
    // An old tab token without any room history gets one legacy server lookup.
    return payload;
  }

  function rememberRoom(state) {
    const code = cleanCode(state?.room?.code);
    if (!code) return getActiveProfile();
    return updateActive((profile) => {
      profile.currentRoomCode = code;
      profile.roomSelectionKnown = true;
      const room = { code, name: String(state.room.name || code), role: state.role || 'player', updatedAt: now() };
      profile.rooms = [room, ...profile.rooms.filter((r) => r.code !== code)];
    });
  }

  function clearCurrentRoom() {
    return updateActive((profile) => {
      profile.currentRoomCode = null;
      profile.roomSelectionKnown = true;
    });
  }

  function forgetRoom(roomCode) {
    const code = cleanCode(roomCode);
    if (!code) return;
    const data = migrate();
    for (const profile of data.profiles) {
      profile.rooms = profile.rooms.filter((room) => room.code !== code);
      if (profile.currentRoomCode === code) {
        profile.currentRoomCode = null;
        profile.roomSelectionKnown = true;
      }
    }
    save(data);
  }

  function markProfileClaimed(token, accountId) {
    const data = migrate();
    const profile = data.profiles.find((entry) => entry.token === token);
    if (!profile) throw new Error('That older player was not found on this browser.');
    if (!accountId) throw new Error('Sign in before connecting an older player.');
    // This is only a local hint. The server verifies ownership on every import.
    profile.claimedBy = accountId;
    save(data);
  }

  return { listProfiles, getActiveProfile, selectProfile, createProfile, getToken, getSavedName, saveName,
    getHelloPayload, rememberRoom, clearCurrentRoom, forgetRoom, markProfileClaimed };
}

let browserStore;
function getBrowserStore() {
  if (!browserStore) {
    browserStore = createSessionStore({
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
      randomToken: () => {
        if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
        if (!globalThis.crypto?.getRandomValues) throw new Error('This browser cannot create a secure player identity. Open the game using HTTPS.');
        return [...globalThis.crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
      },
    });
  }
  return browserStore;
}

export const listProfiles = (...args) => getBrowserStore().listProfiles(...args);
export const getActiveProfile = (...args) => getBrowserStore().getActiveProfile(...args);
export const selectProfile = (...args) => getBrowserStore().selectProfile(...args);
export const createProfile = (...args) => getBrowserStore().createProfile(...args);
export const getToken = (...args) => getBrowserStore().getToken(...args);
export const getSavedName = (...args) => getBrowserStore().getSavedName(...args);
export const saveName = (...args) => getBrowserStore().saveName(...args);
export const getHelloPayload = (...args) => getBrowserStore().getHelloPayload(...args);
export const rememberRoom = (...args) => getBrowserStore().rememberRoom(...args);
export const clearCurrentRoom = (...args) => getBrowserStore().clearCurrentRoom(...args);
export const forgetRoom = (...args) => getBrowserStore().forgetRoom(...args);
export const markProfileClaimed = (...args) => getBrowserStore().markProfileClaimed(...args);
