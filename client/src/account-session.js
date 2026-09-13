// Small, per-tab navigation hints. Account ownership always comes from the server.
const ROOMS_KEY = 'rummy.account.rooms.v1';
const INVITE_KEY = 'rummy.pending-invite.v1';
const ROOM_CODE = /^[A-Z0-9]{5}$/;
const INVITE_TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

export function parseInvitation(text, baseUrl) {
  const value = String(text || '').trim();
  let code;
  let inviteToken;
  if (/^https?:\/\//i.test(value)) {
    const link = new URL(value);
    if (baseUrl && link.origin !== new URL(baseUrl).origin) throw new Error('Use an invitation link from this Irish Rummy site.');
    const params = new URLSearchParams(link.hash.slice(1));
    [code, inviteToken] = String(params.get('invite') || '').split('.');
  } else {
    if (value.split('.').length !== 2) throw new Error('Paste the full invitation link your host shared.');
    [code, inviteToken] = value.split('.');
  }
  code = String(code || '').toUpperCase();
  if (!ROOM_CODE.test(code) || !INVITE_TOKEN.test(inviteToken || '')) {
    throw new Error('Paste the full invitation link your host shared. A room code by itself is not an invitation.');
  }
  return { code, inviteToken };
}

export function invitationUrl(baseUrl, invitation) {
  const verified = parseInvitation(`${invitation.code}.${invitation.inviteToken}`);
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = new URLSearchParams({ invite: `${verified.code}.${verified.inviteToken}` }).toString();
  return url.href;
}

export function createAccountSessionStore({ sessionStorage }) {
  const read = (key) => {
    try { return sessionStorage.getItem(key); }
    catch { throw new Error('Allow browser storage to keep your sign-in and invitation while you return from Google.'); }
  };
  const write = (key, value) => {
    try { sessionStorage.setItem(key, value); }
    catch { throw new Error('This browser could not save your invitation or return place. Allow site storage and try again.'); }
  };
  function roomHints() {
    const raw = read(ROOMS_KEY);
    if (!raw) return {};
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      return data;
    } catch { throw new Error('Your saved return place could not be read. Your older player records have been kept.'); }
  }
  function rememberRoom(accountId, code) {
    if (!accountId) throw new Error('Sign in before saving your return place.');
    const value = code ? String(code).toUpperCase() : null;
    if (value && !ROOM_CODE.test(value)) throw new Error('That game has an invalid room code.');
    write(ROOMS_KEY, JSON.stringify({ ...roomHints(), [accountId]: value }));
  }
  function getRoom(accountId) {
    const code = roomHints()[accountId];
    return typeof code === 'string' && ROOM_CODE.test(code) ? code : null;
  }
  function saveInvitation(invitation) {
    const checked = parseInvitation(`${invitation.code}.${invitation.inviteToken}`);
    write(INVITE_KEY, JSON.stringify(checked));
    return checked;
  }
  function getInvitation() {
    const raw = read(INVITE_KEY);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      return parseInvitation(`${value.code}.${value.inviteToken}`);
    } catch { throw new Error('That saved invitation could not be read. Paste the invitation link again.'); }
  }
  function clearInvitation() {
    try { sessionStorage.removeItem(INVITE_KEY); }
    catch { throw new Error('The invitation could not be cleared from this browser.'); }
  }
  return { getRoom, rememberRoom, saveInvitation, getInvitation, clearInvitation };
}

let store;
export function accountSession() {
  if (!store) store = createAccountSessionStore({ sessionStorage: window.sessionStorage });
  return store;
}
