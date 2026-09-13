import { parseInvitation } from './account-session.js';

// Called at first load and on later fragment navigation. Save before removing
// the link secret so it survives a Google round trip in this same tab.
export function captureInvitation({ href, baseUrl, store, replaceUrl }) {
  const url = new URL(href);
  if (!new URLSearchParams(url.hash.slice(1)).has('invite')) return null;
  const invitation = store.saveInvitation(parseInvitation(href, baseUrl));
  replaceUrl(`${url.pathname}${url.search}`);
  return invitation;
}

// An explicit invitation takes priority over a previous table's return hint.
// The hint remains intact, so declining the invitation never loses that game.
export function roomForIntroduction({ accountId, invitation, store }) {
  return invitation ? null : store.getRoom(accountId);
}
