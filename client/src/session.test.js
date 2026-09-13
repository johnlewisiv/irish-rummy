import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from './session.js';

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

let sequence = 0;
function browser(localStorage = storage(), sessionStorage = storage()) {
  return createSessionStore({ localStorage, sessionStorage, randomToken: () => `test-player-${++sequence}`, now: () => 1000 });
}

const room = (code, name = 'Family table', role = 'player') => ({ room: { code, name }, role });

test('closing the tab preserves the original player and exact game; a new tab requires selection', () => {
  const local = storage();
  const first = browser(local);
  const player = first.createProfile('John');
  first.rememberRoom(room('ABCDE'));

  const reopened = browser(local);
  assert.equal(reopened.getActiveProfile(), null);
  assert.throws(() => reopened.getToken(), /Choose your saved player/);
  assert.equal(reopened.listProfiles()[0].token, player.token);
  reopened.selectProfile(player.token);
  assert.deepEqual(reopened.getHelloPayload(), { token: player.token, name: 'John', roomCode: 'ABCDE' });
});

test('reload restores the active tab while other family members keep independent identities', () => {
  const local = storage();
  const tab = storage();
  const john = browser(local, tab).createProfile('John');
  const janeSession = browser(local);
  const jane = janeSession.createProfile('Jane');
  assert.notEqual(john.token, jane.token);
  assert.equal(browser(local, tab).getToken(), john.token);
  assert.equal(janeSession.getToken(), jane.token);
  assert.equal(janeSession.listProfiles().length, 2);
});

test('names do not replace or claim an existing player identity', () => {
  const local = storage();
  const first = browser(local).createProfile('John');
  const other = browser(local).createProfile('John');
  assert.notEqual(first.token, other.token);
  assert.equal(browser(local).listProfiles().length, 2);
});

test('claiming an older profile preserves its original token and every saved game', () => {
  const local = storage();
  const session = browser(local);
  const profile = session.createProfile('John');
  session.rememberRoom(room('FIRST'));
  session.markProfileClaimed(profile.token, 'verified-account');
  const saved = session.listProfiles()[0];
  assert.equal(saved.token, profile.token);
  assert.equal(saved.claimedBy, 'verified-account');
  assert.deepEqual(saved.rooms.map((entry) => entry.code), ['FIRST']);
});

test('existing tab tokens migrate without changing the token or guessing a room', () => {
  const local = storage({ 'rummy.name': 'John' });
  const tab = storage({ 'rummy.token': 'original-secret' });
  const session = browser(local, tab);
  assert.deepEqual(session.getHelloPayload(), { token: 'original-secret', name: 'John' });
  session.rememberRoom(room('OLDAB'));
  assert.equal(browser(local).listProfiles()[0].currentRoomCode, 'OLDAB');
  assert.equal(tab.getItem('rummy.token'), 'original-secret');
});

test('older local-storage tokens are offered for recovery without silently taking the seat', () => {
  const local = storage({ 'rummy.token': 'older-secret', 'rummy.name': 'Mum' });
  const session = browser(local);
  assert.equal(session.getActiveProfile(), null);
  assert.equal(session.listProfiles()[0].token, 'older-secret');
  session.selectProfile('older-secret');
  assert.deepEqual(session.getHelloPayload(), { token: 'older-secret', name: 'Mum' });
});

test('leaving stays in the lobby while preserving multiple games for explicit recovery', () => {
  const session = browser();
  const player = session.createProfile('John');
  session.rememberRoom(room('FIRST', 'Friday'));
  session.rememberRoom(room('SECND', 'Sunday'));
  session.clearCurrentRoom();
  assert.deepEqual(session.getHelloPayload(), { token: player.token, name: 'John', rejoin: false });
  assert.equal(session.getActiveProfile().rooms.length, 2);
  session.selectProfile(player.token, { roomCode: 'first' });
  assert.equal(session.getHelloPayload().roomCode, 'FIRST');
});

test('closing a room removes only that room from all saved profiles', () => {
  const local = storage();
  const one = browser(local);
  one.createProfile('John');
  one.rememberRoom(room('FIRST'));
  one.rememberRoom(room('OTHER'));
  const two = browser(local);
  two.createProfile('Jane');
  two.rememberRoom(room('FIRST'));
  one.forgetRoom('FIRST');
  assert.deepEqual(one.getActiveProfile().rooms.map((r) => r.code), ['OTHER']);
  assert.deepEqual(two.getActiveProfile().rooms, []);
  assert.equal(two.getHelloPayload().rejoin, false);
});

test('unreadable stored profiles are preserved instead of being silently replaced', () => {
  const local = storage({ 'rummy.profiles.v1': '{broken-json' });
  const session = browser(local);
  assert.throws(() => session.createProfile('John'), /existing browser data has been kept/);
  assert.equal(local.getItem('rummy.profiles.v1'), '{broken-json');
});

test('a failed durable save never selects a new temporary identity', () => {
  const local = storage();
  local.setItem = () => { throw new Error('Storage blocked'); };
  const tab = storage();
  assert.throws(() => browser(local, tab).createProfile('John'), /could not be saved/);
  assert.equal(tab.getItem('rummy.token'), null);
});

test('returned profile records cannot mutate the persisted recovery identity', () => {
  const session = browser();
  const player = session.createProfile('John');
  const profile = session.getActiveProfile();
  profile.token = 'different';
  profile.rooms.push({ code: 'WRONG' });
  assert.equal(session.getToken(), player.token);
  assert.deepEqual(session.getActiveProfile().rooms, []);
});
