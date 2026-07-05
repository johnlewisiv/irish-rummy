// window.test.js — the buy-or-pass window: held draws, early close on
// responses, buy resolution with penalty, ledger recording, expiry.
import assert from 'assert';
import { Game } from '../src/game.js';

// --- all respond → early close, buy resolves, held draw executes ---
{
  const g = new Game([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
    () => {}, { botDelayMs: 0, buyWindowMs: 400 });
  g.startNextRound();
  const cur = g.currentPlayer();
  const others = g.players.filter((p) => p.id !== cur.id);
  assert.ok(g.buyWindow, 'window open at round start');
  const before = cur.hand.length;
  g.draw(cur.id, 'deck');
  assert.strictEqual(cur.hand.length, before, 'draw is held');
  assert.ok(g.buyWindow.pendingDraw, 'pending draw registered');
  assert.throws(() => g.draw(cur.id, 'deck'), /buy or pass/i, 'double draw blocked while held');
  const topCard = g.top();
  const b0 = others[0].hand.length;
  g.requestBuy(others[0].id);
  g.passBuy(others[1].id);
  assert.strictEqual(g.buyWindow, null, 'window closed after all responded');
  assert.strictEqual(others[0].hand.length, b0 + 2, 'buyer got card + penalty');
  assert.ok(others[0].hand.some((c) => c.id === topCard.id), 'buyer holds bought card');
  assert.strictEqual(cur.hand.length, before + 1, 'held draw executed');
  assert.strictEqual(g.turnPhase, 'action', 'turn advanced to action');
  assert.ok(g.buys.length === 1 && g.buys[0].name === others[0].name, 'buy ledger recorded');
  g.assertDeckIntegrity();
  g.destroy();
}

// --- nobody responds → expiry executes the held draw ---
{
  const g2 = new Game([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    () => {}, { botDelayMs: 0, buyWindowMs: 150 });
  g2.startNextRound();
  const cur2 = g2.currentPlayer();
  const n2 = cur2.hand.length;
  g2.draw(cur2.id, 'deck');
  assert.strictEqual(cur2.hand.length, n2, 'held');
  await new Promise((r) => setTimeout(r, 300));
  assert.strictEqual(cur2.hand.length, n2 + 1, 'expired window executed the draw');
  g2.assertDeckIntegrity();
  g2.destroy();
}

// --- current player takes the discard → buys void ---
{
  const g3 = new Game([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    () => {}, { botDelayMs: 0, buyWindowMs: 400 });
  g3.startNextRound();
  const cur3 = g3.currentPlayer();
  const other = g3.players.find((p) => p.id !== cur3.id);
  const topCard = g3.top();
  const oh = other.hand.length;
  g3.requestBuy(other.id); // responds AND closes window (only human)…
  g3.draw(cur3.id, 'discard'); // …but the current player takes it anyway
  assert.ok(cur3.hand.some((c) => c.id === topCard.id), 'current player has priority');
  assert.strictEqual(other.hand.length, oh, 'buyer got nothing — buy voided');
  assert.strictEqual(g3.buys.length, 0, 'no ledger entry for a voided buy');
  g3.assertDeckIntegrity();
  g3.destroy();
}

// --- 3-buy cap per game ---
{
  const g = new Game([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    () => {}, { botDelayMs: 0, buyWindowMs: 400 });
  g.startNextRound();
  for (let i = 0; i < 3; i++) {
    const cur = g.currentPlayer();
    const buyer = g.players.find((p) => p.id !== cur.id);
    g.requestBuy(buyer.id);
    g.draw(cur.id, 'deck'); // window already closed (all responded) → resolves
    // end the turn so a fresh window opens for the next buy
    g.discard(cur.id, cur.hand.find((c) => !c.joker).id);
  }
  assert.strictEqual(Object.values(g.buysUsed).reduce((s, n) => s + n, 0), 3, 'three buys spent');
  // Tracked PER PLAYER: each player has their own independent count.
  assert.ok(Object.keys(g.buysUsed).length >= 1, 'per-player ledger exists');
  for (const [, n] of Object.entries(g.buysUsed)) assert.ok(n <= 3, 'no player over the cap');
  // A player at the cap can no longer request a buy…
  const capped = g.players.find((p) => p.id !== g.currentPlayer().id);
  const other = g.players.find((p) => p.id !== capped.id);
  g.buysUsed[capped.id] = 3;
  g.buysUsed[other.id] = 1;
  assert.throws(() => g.requestBuy(capped.id), /all 3 buys/i, 'buy past the cap rejected');
  // …while another player with buys remaining is unaffected (multi-human safe).
  if (other.id !== g.currentPlayer().id) {
    g.requestBuy(other.id); // does not throw
    g.buyRequests = g.buyRequests.filter((id) => id !== other.id);
  }
  // And the resolver refuses the capped player even if a stale request slipped in.
  g.buyRequests = [capped.id];
  const before = capped.hand.length;
  g._resolveBuys();
  assert.strictEqual(capped.hand.length, before, 'resolver skips capped player');
  // NEW ROUND → everyone's 3 buys come back.
  g.destroy();
  g.startNextRound();
  assert.deepStrictEqual(g.buysUsed, {}, 'buy counts reset at the new deal');
  const anyPlayer = g.players.find((p) => p.id !== g.currentPlayer().id);
  g.requestBuy(anyPlayer.id); // capped last round, free again now
  g.assertDeckIntegrity();
  g.destroy();
  console.log('3-buy-per-ROUND cap (per player, resets each deal) ✔');
}

// --- casual mode (buyWindowMs = 0): no countdown, waits for responses ---
{
  const g = new Game([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    () => {}, { botDelayMs: 0, buyWindowMs: 0 });
  g.startNextRound();
  assert.ok(g.buyWindow, 'window opens in casual mode');
  assert.strictEqual(g.buyWindow.timer, null, 'no countdown timer');
  const cur = g.currentPlayer();
  const other = g.players.find((p) => p.id !== cur.id);
  const n = cur.hand.length;
  g.draw(cur.id, 'deck');
  assert.strictEqual(cur.hand.length, n, 'held indefinitely');
  await new Promise((r) => setTimeout(r, 250));
  assert.strictEqual(cur.hand.length, n, 'still held — no expiry in casual mode');
  g.passBuy(other.id); // everyone responded → draw executes
  assert.strictEqual(cur.hand.length, n + 1, 'released once everyone responded');
  g.assertDeckIntegrity();
  g.destroy();
  console.log('casual (no-timer) window ✔');
}

// --- pause / resume ---
{
  const g = new Game([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    () => {}, { botDelayMs: 0, buyWindowMs: 200 });
  g.startNextRound();
  const cur = g.currentPlayer();
  const other = g.players.find((p) => p.id !== cur.id);
  g.pauseBuy(other.id);
  assert.ok(g.buyWindow.paused, 'paused');
  const n = cur.hand.length;
  g.draw(cur.id, 'deck'); // held
  await new Promise((r) => setTimeout(r, 350));
  assert.strictEqual(cur.hand.length, n, 'timer did not fire while paused');
  g.resumeBuy(other.id);
  // resume grants at least a 1s grace period before expiry
  await new Promise((r) => setTimeout(r, 1300));
  assert.strictEqual(cur.hand.length, n + 1, 'resumed timer expired and released the draw');
  g.assertDeckIntegrity();
  g.destroy();
  console.log('pause / resume ✔');
}

console.log('window.test.js: all assertions passed ✔');
