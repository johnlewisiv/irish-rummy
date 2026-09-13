import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountSessionStore, invitationUrl } from './account-session.js';
import { captureInvitation, roomForIntroduction } from './invitation-navigation.js';

function fixture() {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  const store = createAccountSessionStore({ sessionStorage: storage });
  const replacements = [];
  return { store, storage, replacements, capture: (href) => captureInvitation({ href, baseUrl: 'https://rummy.example/rummy/', store, replaceUrl: (url) => replacements.push(url) }) };
}

test('later fragment invitations replace the pending choice without changing an existing saved table', () => {
  const f = fixture();
  f.store.rememberRoom('alice', 'SAVED');
  const first = { code: 'FIRST', inviteToken: 'synthetic_first_'.repeat(3) };
  const later = { code: 'LATER', inviteToken: 'synthetic_later_'.repeat(3) };
  assert.deepEqual(f.capture(invitationUrl('https://rummy.example/rummy/', first)), first);
  assert.deepEqual(f.capture(invitationUrl('https://rummy.example/rummy/', later)), later);
  assert.deepEqual(f.store.getInvitation(), later);
  assert.deepEqual(f.replacements, ['/rummy/', '/rummy/']);
  assert.equal(roomForIntroduction({ accountId: 'alice', invitation: later, store: f.store }), null);
  assert.equal(f.store.getRoom('alice'), 'SAVED', 'Receiving a new invitation does not erase the earlier game hint');
});

test('OAuth reload keeps the invitation ahead of the old room and dismissal restores normal return behavior', () => {
  const f = fixture();
  f.store.rememberRoom('alice', 'SAVED');
  const invitation = { code: 'OTHER', inviteToken: 'synthetic_invitation_'.repeat(3) };
  f.capture(`https://rummy.example/rummy/?code=synthetic-oauth#invite=${invitation.code}.${invitation.inviteToken}`);
  assert.deepEqual(f.replacements, ['/rummy/?code=synthetic-oauth'], 'The OAuth query is preserved for the provider');
  const reloaded = createAccountSessionStore({ sessionStorage: f.storage });
  assert.equal(roomForIntroduction({ accountId: 'alice', invitation: reloaded.getInvitation(), store: reloaded }), null);
  reloaded.clearInvitation();
  assert.equal(roomForIntroduction({ accountId: 'alice', invitation: reloaded.getInvitation(), store: reloaded }), 'SAVED');
});

test('non-invitation fragments are untouched and failed invitation persistence never removes the link', () => {
  const f = fixture();
  assert.equal(f.capture('https://rummy.example/rummy/#error=synthetic-provider-error'), null);
  assert.deepEqual(f.replacements, []);
  let replaced = false;
  assert.throws(() => captureInvitation({
    href: 'https://rummy.example/rummy/#invite=OTHER.synthetic_invitation_synthetic_invitation',
    baseUrl: 'https://rummy.example/rummy/',
    store: { saveInvitation() { throw new Error('Storage blocked'); } },
    replaceUrl: () => { replaced = true; },
  }), /Storage blocked/);
  assert.equal(replaced, false);
});
