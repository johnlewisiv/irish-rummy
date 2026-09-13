import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountSessionStore, invitationUrl, parseInvitation } from './account-session.js';

function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}
const invitation = { code: 'ABCDE', inviteToken: 'test_token_'.repeat(5) };

test('invitation secrets stay in the fragment, survive OAuth reload, and clear only explicitly', () => {
  const base = 'https://rummy.example/rummy/';
  const link = invitationUrl(`${base}?code=oauth-code`, invitation);
  assert.equal(new URL(link).search, '');
  assert.ok(new URL(link).hash.startsWith('#invite=ABCDE.'));
  const sharedTab = storage();
  createAccountSessionStore({ sessionStorage: sharedTab }).saveInvitation(parseInvitation(link, base));
  const callback = createAccountSessionStore({ sessionStorage: sharedTab });
  assert.deepEqual(callback.getInvitation(), invitation);
  callback.clearInvitation();
  assert.equal(callback.getInvitation(), null);
});

test('a bare room code and another origin are not accepted as invitation links', () => {
  assert.throws(() => parseInvitation('ABCDE'), /full invitation/);
  assert.throws(() => parseInvitation(invitationUrl('https://other.example/', invitation), 'https://rummy.example/'), /this Irish Rummy site/);
  assert.throws(() => parseInvitation('ABCDE.short'), /full invitation/);
});

test('room recovery belongs to one account and one tab, including intentional My games return', () => {
  const localTab = storage();
  const one = createAccountSessionStore({ sessionStorage: localTab });
  one.rememberRoom('first-account', 'ABCDE');
  one.rememberRoom('second-account', 'OTHER');
  const reloaded = createAccountSessionStore({ sessionStorage: localTab });
  assert.equal(reloaded.getRoom('first-account'), 'ABCDE');
  assert.equal(reloaded.getRoom('second-account'), 'OTHER');
  reloaded.rememberRoom('first-account', null);
  assert.equal(reloaded.getRoom('first-account'), null);
  assert.equal(reloaded.getRoom('second-account'), 'OTHER');
  assert.equal(createAccountSessionStore({ sessionStorage: storage() }).getRoom('second-account'), null);
});

test('blocked storage never pretends an invitation was saved', () => {
  const broken = createAccountSessionStore({ sessionStorage: { getItem: () => null, setItem: () => { throw new Error(); } } });
  assert.throws(() => broken.saveInvitation(invitation), /could not save/);
});
