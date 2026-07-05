// engine.test.js — targeted engine tests for mechanics bots don't use:
// joker swap in straights, the must-play-joker rule, buying resolution,
// and set "death". State is rigged by MOVING real cards (deck integrity holds).
import assert from 'assert';
import { Game } from '../src/game.js';
import { validateStraight } from '../src/rules.js';

function newGame() {
  const game = new Game(
    [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }],
    () => {}, { botDelayMs: 0 },
  );
  game.startNextRound();
  return game;
}

/** Move a specific card (by rank+suit / joker) from anywhere into `dest`. */
function moveCard(game, match, dest) {
  const pools = [game.drawPile, game.discardPile, ...game.players.map((p) => p.hand)];
  for (const pool of pools) {
    const i = pool.findIndex((c) => (match.joker ? c.joker : !c.joker && c.rank === match.rank && c.suit === match.suit));
    if (i >= 0) {
      const [card] = pool.splice(i, 1);
      dest.push(card);
      return card;
    }
  }
  throw new Error(`card not found: ${JSON.stringify(match)}`);
}

function emptyHandInto(player, game) {
  while (player.hand.length) game.drawPile.push(player.hand.pop());
}

/* ---- 1. joker swap + must-play-joker + going out ---- */
{
  const game = newGame();
  const [a, b] = game.players;
  emptyHandInto(a, game);
  emptyHandInto(b, game);
  // Bob's table straight: 9♥ [Joker=10♥] J♥ Q♥
  const meldCards = [];
  moveCard(game, { rank: '9', suit: 'H' }, meldCards);
  moveCard(game, { joker: true }, meldCards);
  moveCard(game, { rank: 'J', suit: 'H' }, meldCards);
  moveCard(game, { rank: 'Q', suit: 'H' }, meldCards);
  const v = validateStraight(meldCards);
  assert.ok(v.ok);
  game.tableMelds.push({ id: 'mX', ownerId: 'b', type: 'straight', cards: meldCards, suit: v.suit, startValue: v.startValue, repr: v.repr });
  b.hasGoneDown = true;
  // Alice holds the real 10♥ and a 3♣; she has gone down.
  moveCard(game, { rank: '10', suit: 'H' }, a.hand);
  moveCard(game, { rank: '3', suit: 'C' }, a.hand);
  a.hasGoneDown = true;
  game.currentIndex = 0;
  game.turnPhase = 'action';
  game.assertDeckIntegrity();

  const tenH = a.hand.find((c) => c.rank === '10');
  const threeC = a.hand.find((c) => c.rank === '3');
  game.swapJoker('a', 'mX', tenH.id);
  assert.ok(a.hand.some((c) => c.joker), 'Alice now holds the joker');
  assert.ok(game.tableMelds[0].cards.every((c) => !c.joker), 'straight is now all natural');
  assert.ok(game.mustPlayJoker['a'], 'must-play-joker flag set');
  // She may NOT discard another card while holding the swapped joker…
  assert.throws(() => game.discard('a', threeC.id), /must play the joker/);
  // …but can play the joker to extend the same straight (as 8♥ or K♥).
  const joker = a.hand.find((c) => c.joker);
  assert.throws(
    () => game.layOff('a', 'mX', joker.id),
    /Choose low or high end/,
    'ambiguous joker placement requires a chosen end',
  );
  game.layOff('a', 'mX', joker.id, 'high');
  assert.strictEqual(game.mustPlayJoker['a'], undefined, 'joker obligation cleared');
  assert.strictEqual(game.tableMelds[0].cards.length, 5, 'straight extended to 5');
  // Discarding her last card ends the round (she had gone down).
  game.discard('a', threeC.id);
  assert.strictEqual(game.phase, 'roundEnd');
  assert.strictEqual(game.roundSummary.winner, 'Alice');
  assert.ok(game.roundSummary.scores.find((s) => s.name === 'Bob').roundPoints === 0, 'Bob had no cards left in hand');
  game.destroy();
  console.log('joker swap / must-play / go-out ✔');
}

/* ---- 2. buying: priority player gets card + penalty on deck draw ---- */
{
  const game = newGame();
  const [a, b] = game.players;
  game.currentIndex = 0;
  game.turnPhase = 'draw';
  const before = b.hand.length;
  const topCard = game.top();
  game.requestBuy('b');
  assert.deepStrictEqual(game.buyRequests, ['b']);
  game.draw('a', 'deck'); // Alice declines the discard → Bob's buy resolves
  assert.strictEqual(b.hand.length, before + 2, 'Bob got the card + penalty card');
  assert.ok(b.hand.some((c) => c.id === topCard.id), 'Bob holds the bought card');
  assert.strictEqual(game.buyRequests.length, 0);
  game.assertDeckIntegrity();
  game.destroy();
  console.log('buying with penalty card ✔');
}

/* ---- 3. buying voided when current player takes the discard ---- */
{
  const game = newGame();
  const [a, b] = game.players;
  game.currentIndex = 0;
  game.turnPhase = 'draw';
  const topCard = game.top();
  game.requestBuy('b');
  game.draw('a', 'discard'); // Alice takes it herself — she has priority
  assert.ok(a.hand.some((c) => c.id === topCard.id), 'Alice got the card');
  assert.strictEqual(game.buyRequests.length, 0, 'buy voided');
  game.assertDeckIntegrity();
  game.destroy();
  console.log('buy priority (current player first) ✔');
}

/* ---- 4. cards added to sets die; wrong layoffs rejected ---- */
{
  const game = newGame();
  const [a] = game.players;
  emptyHandInto(a, game);
  const setCards = [];
  moveCard(game, { rank: '7', suit: 'S' }, setCards);
  moveCard(game, { rank: '7', suit: 'H' }, setCards);
  moveCard(game, { rank: '7', suit: 'D' }, setCards);
  game.tableMelds.push({ id: 'mS', ownerId: 'b', type: 'set', rank: '7', cards: setCards });
  moveCard(game, { rank: '7', suit: 'S' }, a.hand); // duplicate suit is fine when adding
  moveCard(game, { rank: '8', suit: 'S' }, a.hand);
  a.hasGoneDown = true;
  game.currentIndex = 0;
  game.turnPhase = 'action';
  const seven = a.hand.find((c) => c.rank === '7');
  const eight = a.hand.find((c) => c.rank === '8');
  assert.throws(() => game.layOff('a', 'mS', eight.id), /doesn't fit/);
  game.layOff('a', 'mS', seven.id);
  assert.strictEqual(game.tableMelds[0].cards.length, 4, 'set grew to 4 (and stays dead)');
  game.assertDeckIntegrity();
  game.destroy();
  console.log('set layoff + rejection ✔');
}

console.log('engine.test.js: all assertions passed ✔');
