// Practice setup is a sequence of saved server actions. Stop immediately if the
// player signs out, changes accounts, leaves, or opens another table between them.
export async function createPracticeGame({ call, isCurrent }) {
  const cancelled = { ok: false, cancelled: true };
  if (!isCurrent()) return cancelled;
  const created = await call('rooms:create', { roomName: 'Practice table', practice: true });
  if (created?.ok === false) return created;
  const code = created.code;
  if (!isCurrent(code)) return cancelled;
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const result = await call('room:addBot', { difficulty });
    if (result?.ok === false) return result;
    if (!isCurrent(code)) return cancelled;
  }
  const started = await call('room:start');
  return isCurrent(code) ? started : cancelled;
}
