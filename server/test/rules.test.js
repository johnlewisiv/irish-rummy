// rules.test.js — unit tests for deck construction, meld validation, scoring.
import assert from 'assert';
import { buildDeck, cardPoints } from '../src/deck.js';
import {
  RULES, validateSet, validateStraight, validateGoDown, layoffOptions,
  jokerSwapIndex, solveContract,
} from '../src/rules.js';

let n = 0;
const c = (rank, suit) => ({ id: `t${n++}`, rank, suit, joker: false });
const J = () => ({ id: `t${n++}`, rank: 'JOKER', suit: null, joker: true });

// ---- deck construction ----
assert.strictEqual(buildDeck(2).length, 108, '2 players: 108 cards');
assert.strictEqual(buildDeck(4).length, 108, '4 players: 108 cards');
assert.strictEqual(buildDeck(5).length, 162, '5 players: 162 cards');
assert.strictEqual(new Set(buildDeck(6).map((x) => x.id)).size, 162, 'unique ids');

// ---- scoring ----
assert.strictEqual(cardPoints(c('7', 'S')), 7);
assert.strictEqual(cardPoints(c('10', 'H')), 10);
assert.strictEqual(cardPoints(c('K', 'D')), 10);
assert.strictEqual(cardPoints(c('A', 'C')), 15);
assert.strictEqual(cardPoints(J()), 50);

// ---- sets ----
assert.ok(validateSet([c('9', 'S'), c('9', 'H'), c('9', 'D')]).ok, 'basic set');
// Default house rule: duplicate suits allowed (two identical decks in play)
assert.ok(validateSet([c('9', 'S'), c('9', 'S'), c('9', 'D')]).ok, 'duplicate suit allowed by default');
// Strict mode (STRICT_SET_SUITS=1) rejects duplicate suits in the initial 3
RULES.strictSetSuits = true;
assert.ok(!validateSet([c('9', 'S'), c('9', 'S'), c('9', 'D')]).ok, 'strict mode rejects duplicate suit');
assert.ok(validateSet([c('9', 'S'), c('9', 'H'), c('9', 'D')]).ok, 'strict mode: distinct suits fine');
RULES.strictSetSuits = false;
assert.ok(!validateSet([c('9', 'S'), c('8', 'H'), c('9', 'D')]).ok, 'mixed ranks rejected');
assert.ok(validateSet([c('9', 'S'), c('9', 'H'), J()]).ok, 'joker completes set');
assert.ok(!validateSet([J(), J(), J()]).ok, 'all-joker set rejected');
assert.ok(!validateSet([c('9', 'S'), c('9', 'H')]).ok, 'two cards rejected');

// ---- straights ----
assert.ok(validateStraight([c('4', 'S'), c('5', 'S'), c('6', 'S'), c('7', 'S')]).ok, 'basic straight');
assert.ok(!validateStraight([c('4', 'S'), c('5', 'H'), c('6', 'S'), c('7', 'S')]).ok, 'mixed suits rejected');
assert.ok(!validateStraight([c('4', 'S'), c('6', 'S'), c('5', 'S'), c('7', 'S')]).ok, 'out of order rejected');
assert.ok(validateStraight([c('A', 'D'), c('2', 'D'), c('3', 'D'), c('4', 'D')]).ok, 'ace low');
assert.ok(validateStraight([c('J', 'C'), c('Q', 'C'), c('K', 'C'), c('A', 'C')]).ok, 'ace high');
assert.ok(!validateStraight([c('K', 'C'), c('A', 'C'), c('2', 'C'), c('3', 'C')]).ok, 'no wrap-around');
const withJoker = validateStraight([c('9', 'H'), J(), c('J', 'H'), c('Q', 'H')]);
assert.ok(withJoker.ok, 'joker fills gap');
assert.deepStrictEqual(withJoker.repr[1], { rank: '10', suit: 'H' }, 'joker represents 10♥');
assert.ok(!validateStraight([c('9', 'H'), c('10', 'H'), c('J', 'H')]).ok, 'three cards rejected');

// ---- go-down contracts ----
const r1ok = validateGoDown([
  { type: 'set', cards: [c('3', 'S'), c('3', 'D'), c('3', 'C')] },
  { type: 'set', cards: [c('7', 'H'), c('7', 'S'), c('7', 'D')] },
], 1);
assert.ok(r1ok.ok, 'round 1: two sets');
assert.ok(!validateGoDown([
  { type: 'set', cards: [c('3', 'S'), c('3', 'D'), c('3', 'C')] },
  { type: 'straight', cards: [c('4', 'S'), c('5', 'S'), c('6', 'S'), c('7', 'S')] },
], 1).ok, 'round 1 rejects set+straight');
assert.ok(validateGoDown([
  { type: 'straight', cards: [c('4', 'S'), c('5', 'S'), c('6', 'S'), c('7', 'S')] },
  { type: 'straight', cards: [c('9', 'D'), c('10', 'D'), c('J', 'D'), c('Q', 'D')] },
], 3).ok, 'round 3: two straights');

// ---- layoff ----
const straightMeld = (() => {
  const cards = [c('5', 'S'), c('6', 'S'), c('7', 'S'), c('8', 'S')];
  const v = validateStraight(cards);
  return { id: 'm1', type: 'straight', cards, suit: v.suit, startValue: v.startValue, repr: v.repr };
})();
assert.deepStrictEqual(layoffOptions(c('4', 'S'), straightMeld), { low: true }, 'extend low');
assert.deepStrictEqual(layoffOptions(c('9', 'S'), straightMeld), { high: true }, 'extend high');
assert.strictEqual(layoffOptions(c('9', 'H'), straightMeld), null, 'wrong suit');
assert.strictEqual(layoffOptions(c('6', 'S'), straightMeld), null, 'middle card no fit');
const setMeld = { id: 'm2', type: 'set', rank: 'Q', cards: [c('Q', 'S'), c('Q', 'H'), c('Q', 'D')] };
assert.deepStrictEqual(layoffOptions(c('Q', 'S'), setMeld), { set: true }, 'add duplicate suit to set (dies)');
assert.deepStrictEqual(layoffOptions(J(), setMeld), { set: true }, 'joker onto set');

// ---- joker swap ----
const js = (() => {
  const cards = [c('9', 'H'), J(), c('J', 'H'), c('Q', 'H')];
  const v = validateStraight(cards);
  return { id: 'm3', type: 'straight', cards, suit: v.suit, startValue: v.startValue, repr: v.repr };
})();
assert.strictEqual(jokerSwapIndex(c('10', 'H'), js), 1, '10♥ replaces the joker');
assert.strictEqual(jokerSwapIndex(c('10', 'S'), js), -1, 'wrong suit cannot replace');

// ---- solver ----
const hand1 = [c('3', 'S'), c('3', 'D'), c('3', 'C'), c('7', 'H'), c('7', 'S'), J(),
  c('K', 'D'), c('2', 'H'), c('9', 'C'), c('4', 'D'), c('A', 'S')];
assert.ok(solveContract(hand1, 1), 'solver finds two sets (one via joker)');
assert.strictEqual(solveContract(hand1, 4), null, 'cannot find three sets');
const hand7 = [
  c('2', 'S'), c('3', 'S'), c('4', 'S'), c('5', 'S'),
  c('8', 'H'), c('9', 'H'), c('10', 'H'), c('J', 'H'),
  c('J', 'D'), c('Q', 'D'), J(), c('A', 'D'),
];
assert.ok(solveContract(hand7, 7), 'solver finds three straights (joker as K♦)');

console.log('rules.test.js: all assertions passed ✔');
