// rules.js — Irish Rummy contracts, meld validation, and a meld solver.
//
// Round contracts (Aunt Peggy's rules):
//   1: two sets of 3          5: two sets + one straight
//   2: one set + one straight 6: one set + two straights
//   3: two straights of 4     7: three straights of 4 (12 cards dealt)
//   4: three sets of 3
//
// Set:      3+ cards of the same rank. The initial 3 natural cards must be of
//           different suits (jokers wild). Cards added later "die".
// Straight: 4+ consecutive cards of the same suit. Jokers wild. Ace may be
//           low (A-2-3-4) or high (J-Q-K-A); no wrap-around.

import { rankValue, rankFromValue } from './deck.js';

export const CONTRACTS = [
  null, // rounds are 1-indexed
  { sets: 2, straights: 0, deal: 11, label: 'Two sets of 3' },
  { sets: 1, straights: 1, deal: 11, label: 'One set of 3 + one straight of 4' },
  { sets: 0, straights: 2, deal: 11, label: 'Two straights of 4' },
  { sets: 3, straights: 0, deal: 11, label: 'Three sets of 3' },
  { sets: 2, straights: 1, deal: 11, label: 'Two sets of 3 + one straight of 4' },
  { sets: 1, straights: 2, deal: 11, label: 'One set of 3 + two straights of 4' },
  { sets: 0, straights: 3, deal: 12, label: 'Three straights of 4 (12 cards)' },
];
export const TOTAL_ROUNDS = 7;

// House rule: must the initial 3 cards of a set be different suits?
// With two identical decks a hand often holds e.g. 7♠ 7♠ 7♥ — rejecting that
// makes going down brutally hard, so the default is OFF (any suits allowed).
// Set STRICT_SET_SUITS=1 in the environment if your family plays it strict.
export const RULES = {
  strictSetSuits: process.env.STRICT_SET_SUITS === '1',
};

/* ------------------------------------------------------------------ *
 * Validation of explicit melds (what a human player lays down)
 * ------------------------------------------------------------------ */

/**
 * Validate a SET being laid down: 3+ same-rank cards, jokers wild,
 * at least one natural card, initial naturals of distinct suits (house rule).
 * Returns { ok, rank } or { ok:false, error }.
 */
export function validateSet(cards) {
  if (cards.length < 3) return { ok: false, error: 'A set needs at least 3 cards.' };
  const naturals = cards.filter((c) => !c.joker);
  if (naturals.length === 0) return { ok: false, error: 'A set needs at least one real card.' };
  const rank = naturals[0].rank;
  if (!naturals.every((c) => c.rank === rank)) {
    return { ok: false, error: 'All cards in a set must share the same rank.' };
  }
  if (RULES.strictSetSuits && cards.length === 3) {
    const suits = naturals.map((c) => c.suit);
    if (new Set(suits).size !== suits.length) {
      return { ok: false, error: 'The three cards of a set must be different suits.' };
    }
  }
  return { ok: true, rank };
}

/**
 * Validate a STRAIGHT laid down as an ORDERED array of cards (low → high).
 * Jokers fill their positional gap. Infers what each joker represents.
 * Returns { ok, suit, startValue, repr } where repr[i] = {rank, suit} for
 * every position, or { ok:false, error }.
 */
export function validateStraight(cards) {
  if (cards.length < 4) return { ok: false, error: 'A straight needs at least 4 cards.' };
  const naturals = cards
    .map((c, i) => ({ c, i }))
    .filter((x) => !x.c.joker);
  if (naturals.length === 0) return { ok: false, error: 'A straight needs at least one real card.' };
  const suit = naturals[0].c.suit;
  if (!naturals.every((x) => x.c.suit === suit)) {
    return { ok: false, error: 'All cards in a straight must be the same suit.' };
  }
  // Each ace can be low (1) or high (14); try every combination (aces are few).
  const aceIdxs = naturals.filter((x) => x.c.rank === 'A').map((x) => x.i);
  const combos = 1 << aceIdxs.length;
  for (let mask = 0; mask < combos; mask++) {
    const valueAt = new Map(); // position -> numeric value
    naturals.forEach((x) => {
      let v = rankValue(x.c.rank, false);
      const ai = aceIdxs.indexOf(x.i);
      if (ai >= 0 && mask & (1 << ai)) v = 14;
      valueAt.set(x.i, v);
    });
    const first = naturals[0];
    const base = valueAt.get(first.i) - first.i; // value of position 0
    let good = base >= 1 && base + cards.length - 1 <= 14;
    if (good) {
      for (const x of naturals) {
        if (valueAt.get(x.i) !== base + x.i) { good = false; break; }
      }
    }
    if (good) {
      const repr = cards.map((c, i) => ({ rank: rankFromValue(base + i), suit }));
      return { ok: true, suit, startValue: base, repr };
    }
  }
  return { ok: false, error: 'Cards do not form a consecutive same-suit straight.' };
}

/**
 * Validate a full go-down against the round contract.
 * melds: [{ type:'set'|'straight', cards:[card,...] }]  (straights ordered)
 * Returns { ok, validated:[...] } or { ok:false, error }.
 */
export function validateGoDown(melds, roundNumber) {
  const contract = CONTRACTS[roundNumber];
  const sets = melds.filter((m) => m.type === 'set');
  const straights = melds.filter((m) => m.type === 'straight');
  if (sets.length !== contract.sets || straights.length !== contract.straights) {
    return { ok: false, error: `Round ${roundNumber} needs ${contract.label}.` };
  }
  const validated = [];
  for (const m of melds) {
    const res = m.type === 'set' ? validateSet(m.cards) : validateStraight(m.cards);
    if (!res.ok) return res;
    validated.push({ ...m, ...res });
  }
  return { ok: true, validated };
}

/* ------------------------------------------------------------------ *
 * Table meld operations (after going down)
 * ------------------------------------------------------------------ */

/**
 * Can `card` be added to table meld `meld`?
 * Sets: same rank (any suit) or joker. Added cards die — but the whole set is
 * already dead, so this is just membership.
 * Straights: only extend the low or high end. Returns which end(s) work.
 */
export function layoffOptions(card, meld) {
  if (meld.type === 'set') {
    if (card.joker || card.rank === meld.rank) return { set: true };
    return null;
  }
  // straight
  const lo = meld.startValue;
  const hi = meld.startValue + meld.cards.length - 1;
  const opts = {};
  if (card.joker) {
    if (lo > 1) opts.low = true;
    if (hi < 14) opts.high = true;
  } else {
    if (card.suit === meld.suit) {
      const vLow = rankValue(card.rank, false);
      const vHigh = rankValue(card.rank, true);
      if (vLow === lo - 1 || vHigh === lo - 1) opts.low = true;
      if (vLow === hi + 1 || vHigh === hi + 1) opts.high = true;
    }
  }
  return opts.low || opts.high || opts.set ? opts : null;
}

/**
 * Find a joker in a straight that `card` (a natural card) can replace.
 * Returns the index of the joker position, or -1.
 */
export function jokerSwapIndex(card, meld) {
  if (meld.type !== 'straight' || card.joker) return -1;
  for (let i = 0; i < meld.cards.length; i++) {
    if (meld.cards[i].joker) {
      const r = meld.repr[i];
      if (r.rank === card.rank && r.suit === card.suit) return i;
    }
  }
  return -1;
}

/* ------------------------------------------------------------------ *
 * Meld solver — used by bots and by the "can I go down?" hint.
 * Finds disjoint melds in `hand` satisfying the round contract.
 * ------------------------------------------------------------------ */

/** Generate candidate sets (exactly 3 cards) from hand. */
function candidateSets(hand) {
  const jokers = hand.filter((c) => c.joker);
  const byRank = new Map();
  for (const c of hand) {
    if (c.joker) continue;
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank).push(c);
  }
  const out = [];
  for (const [, cards] of byRank) {
    // choose combinations of naturals of size 3, 2, or 1 (+ jokers)
    const combos = kCombinations(cards, 3)
      .concat(jokers.length >= 1 ? kCombinations(cards, 2) : [])
      .concat(jokers.length >= 2 ? kCombinations(cards, 1) : []);
    for (const nat of combos) {
      const need = 3 - nat.length;
      if (need > jokers.length) continue;
      if (RULES.strictSetSuits) {
        const suits = nat.map((c) => c.suit);
        if (new Set(suits).size !== suits.length) continue;
      }
      out.push({ type: 'set', cards: [...nat, ...jokers.slice(0, need)] });
    }
  }
  return out;
}

/** Generate candidate straights (exactly 4 cards, ordered) from hand. */
function candidateStraights(hand) {
  const jokers = hand.filter((c) => c.joker);
  const out = [];
  const suits = ['S', 'H', 'D', 'C'];
  for (const suit of suits) {
    // Map value -> available natural cards of that value+suit
    const byVal = new Map();
    for (const c of hand) {
      if (c.joker || c.suit !== suit) continue;
      const vals = c.rank === 'A' ? [1, 14] : [rankValue(c.rank)];
      for (const v of vals) {
        if (!byVal.has(v)) byVal.set(v, []);
        byVal.get(v).push(c);
      }
    }
    for (let start = 1; start <= 11; start++) {
      const window = [start, start + 1, start + 2, start + 3];
      const slots = window.map((v) => (byVal.get(v) || [])[0] || null);
      const usedIds = new Set();
      const cards = [];
      let jokersNeeded = 0;
      for (let i = 0; i < 4; i++) {
        // Avoid using the same physical card twice (ace counted at 1 and 14)
        let card = null;
        for (const cand of byVal.get(window[i]) || []) {
          if (!usedIds.has(cand.id)) { card = cand; break; }
        }
        if (card) { usedIds.add(card.id); cards.push(card); }
        else { cards.push(null); jokersNeeded++; }
      }
      const naturalCount = 4 - jokersNeeded;
      if (naturalCount === 0 || jokersNeeded > jokers.length) continue;
      const filled = cards.map((c) => c); // placeholder for jokers below
      out.push({ type: 'straight', suit, start, slots: filled, jokersNeeded, naturalCount });
    }
  }
  return out;
}

/**
 * Try to satisfy the contract with disjoint cards. Returns
 * { melds:[{type, cards(ordered)}] } or null.
 */
export function solveContract(hand, roundNumber) {
  const contract = CONTRACTS[roundNumber];
  const sets = candidateSets(hand);
  const straights = candidateStraights(hand);
  // Prefer melds that use fewer jokers (save jokers) and more naturals.
  sets.sort((a, b) => a.cards.filter((c) => c.joker).length - b.cards.filter((c) => c.joker).length);
  straights.sort((a, b) => a.jokersNeeded - b.jokersNeeded);

  const jokers = hand.filter((c) => c.joker);
  const need = [];
  for (let i = 0; i < contract.sets; i++) need.push('set');
  for (let i = 0; i < contract.straights; i++) need.push('straight');

  const usedIds = new Set();
  const chosen = [];

  function take(cards) { cards.forEach((c) => usedIds.add(c.id)); }
  function release(cards) { cards.forEach((c) => usedIds.delete(c.id)); }
  function freeJokers() { return jokers.filter((j) => !usedIds.has(j.id)); }

  function search(k) {
    if (k === need.length) return true;
    const want = need[k];
    if (want === 'set') {
      for (const s of sets) {
        const naturals = s.cards.filter((c) => !c.joker);
        if (naturals.some((c) => usedIds.has(c.id))) continue;
        const jokersInCand = s.cards.length - naturals.length;
        const fj = freeJokers();
        if (jokersInCand > fj.length) continue;
        const cards = [...naturals, ...fj.slice(0, jokersInCand)];
        take(cards);
        chosen.push({ type: 'set', cards });
        if (search(k + 1)) return true;
        chosen.pop();
        release(cards);
      }
    } else {
      for (const st of straights) {
        const naturals = st.slots.filter((c) => c !== null);
        if (naturals.some((c) => usedIds.has(c.id))) continue;
        const fj = freeJokers();
        if (st.jokersNeeded > fj.length) continue;
        let jIdx = 0;
        const cards = st.slots.map((c) => (c !== null ? c : fj[jIdx++]));
        take(cards);
        chosen.push({ type: 'straight', cards });
        if (search(k + 1)) return true;
        chosen.pop();
        release(cards);
      }
    }
    return false;
  }

  return search(0) ? { melds: chosen.map((m) => ({ type: m.type, cards: [...m.cards] })) } : null;
}

function kCombinations(arr, k) {
  if (k > arr.length) return [];
  if (k === 0) return [[]];
  const out = [];
  const rec = (start, combo) => {
    if (combo.length === k) { out.push([...combo]); return; }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      rec(i + 1, combo);
      combo.pop();
    }
  };
  rec(0, []);
  return out;
}
