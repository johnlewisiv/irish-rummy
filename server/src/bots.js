// bots.js — computer opponents in four difficulties.
//
// The bots play toward a PLAN: the best partial fill of the round contract
// (greedy choice of straight windows / set groups). Cards in the plan are
// kept; everything else is discard fodder.
//
//   easy    (Pippin):       draws mostly blind, sloppy discards, never buys.
//   medium  (Tom Bombadil): plan-driven, buys only when it completes the contract.
//   hard    (Saruman):      tighter thresholds, buys clearly useful cards.
//   extreme (Peggy):        buys aggressively, denies layoff-able discards,
//                           plays every angle. She learned from nuns.

import { rankValue, cardPoints } from './deck.js';
import { CONTRACTS, RULES, solveContract, layoffOptions } from './rules.js';

const SUITS = ['S', 'H', 'D', 'C'];

/** Per-difficulty tuning knobs. Buying is a scalpel, not a hammer — every buy
 *  costs a penalty card, so only precise buys actually win games. */
const PARAMS = {
  easy: { drawGain: 2, completionBuys: false, buyGain: Infinity, buyJokers: false, denyDiscards: false, spareWeight: 0, jokerAware: false, maxHand: 12 },
  medium: { drawGain: 1, completionBuys: false, buyGain: Infinity, buyJokers: false, denyDiscards: false, spareWeight: 0, jokerAware: false, maxHand: 13 },
  hard: { drawGain: 1, completionBuys: true, buyGain: Infinity, buyJokers: false, denyDiscards: false, spareWeight: 0, jokerAware: false, maxHand: 13 },
  extreme: { drawGain: 1, completionBuys: true, buyGain: Infinity, buyJokers: false, denyDiscards: true, spareWeight: 12, jokerAware: false, cardCounter: true, maxHand: 13 },
};
const P = (bot) => PARAMS[bot.difficulty] || PARAMS.medium;

/** Numeric values a card can stand for in a straight. */
function valuesOf(card) {
  return card.rank === 'A' ? [1, 14] : [rankValue(card.rank)];
}

/* ------------------------------------------------------------------ *
 * The plan: best greedy partial fill of the contract
 * ------------------------------------------------------------------ */

/**
 * Greedily reserve cards toward the contract. Returns
 * { keep:Set<cardId>, filled:number } where `filled` counts natural cards
 * sitting in reserved meld slots (higher = closer to going down).
 */
function makePlan(hand, roundNumber) {
  const contract = CONTRACTS[roundNumber];
  const keep = new Set();
  const used = new Set();
  let filled = 0;
  for (const c of hand) if (c.joker) keep.add(c.id); // jokers always kept

  const availOfSuit = (suit) => hand.filter((c) => !c.joker && c.suit === suit && !used.has(c.id));

  // Straights: repeatedly grab the window (suit, start..start+3) with most naturals.
  for (let t = 0; t < contract.straights; t++) {
    let best = null;
    for (const suit of SUITS) {
      const pool = availOfSuit(suit);
      for (let start = 1; start <= 11; start++) {
        const cards = [];
        for (let v = start; v < start + 4; v++) {
          const card = pool.find((c) => !cards.includes(c) && valuesOf(c).includes(v));
          if (card) cards.push(card);
        }
        if (!best || cards.length > best.cards.length) best = { cards };
      }
    }
    if (best && best.cards.length >= 2) {
      best.cards.forEach((c) => { used.add(c.id); keep.add(c.id); });
      filled += best.cards.length;
    }
  }

  // Sets: repeatedly grab the biggest same-rank group (max 3 counted).
  for (let s = 0; s < contract.sets; s++) {
    const byRank = new Map();
    for (const c of hand) {
      if (c.joker || used.has(c.id)) continue;
      if (!byRank.has(c.rank)) byRank.set(c.rank, []);
      byRank.get(c.rank).push(c);
    }
    let best = null;
    for (const [, cards] of byRank) {
      let group;
      if (RULES.strictSetSuits) {
        group = [];
        const seen = new Set();
        for (const c of cards) {
          if (!seen.has(c.suit)) { seen.add(c.suit); group.push(c); }
          if (group.length === 3) break;
        }
      } else {
        group = cards.slice(0, 3);
      }
      if (!best || group.length > best.length) best = group;
    }
    if (best && best.length >= 2) {
      best.forEach((c) => { used.add(c.id); keep.add(c.id); });
      filled += best.length;
    }
  }
  return { keep, filled };
}

/* ------------------------------------------------------------------ *
 * Decisions used by the Game engine
 * ------------------------------------------------------------------ */

/** Where should the bot draw from? Returns 'deck' | 'discard'. */
export function botDraw(bot, game) {
  const top = game.top();
  if (!top) return 'deck';
  // Taking it lets us go down right now?
  if (!bot.hasGoneDown && solveContract([...bot.hand, top], game.round)) return 'discard';
  // After going down: take it only to lay it off immediately.
  if (bot.hasGoneDown) {
    return game.tableMelds.some((m) => layoffOptions(top, m)) ? 'discard' : 'deck';
  }
  if (top.joker && bot.difficulty !== 'easy') return 'discard'; // free joker!
  const base = progress(bot, bot.hand, game.round);
  const gain = progress(bot, [...bot.hand, top], game.round) - base;
  // Peggy counts cards — she has an uncanny sense of what the deck holds
  // next, and only draws blind when the deck genuinely beats the discard.
  // (Yes, it's an edge. She learned it from the nuns. It's disclosed.)
  if (P(bot).cardCounter && game.drawPile.length > 0) {
    const deckNext = game.drawPile[0];
    if (!bot.hasGoneDown && solveContract([...bot.hand, deckNext], game.round)) return 'deck';
    const deckGain = deckNext.joker
      ? 99
      : progress(bot, [...bot.hand, deckNext], game.round) - base;
    if (gain > deckGain) return 'discard';
    if (deckGain > gain) return 'deck';
    // tie: prefer the cheaper card in hand
  }
  return gain >= P(bot).drawGain ? 'discard' : 'deck';
}

/**
 * How close is this hand to the contract? Naturals sitting in plan slots,
 * plus (for joker-aware bots) jokers counted as wild fillers for the
 * remaining slots — two jokers and a half-built straight IS progress.
 */
function progress(bot, hand, roundNumber) {
  const contract = CONTRACTS[roundNumber];
  const { filled } = makePlan(hand, roundNumber);
  if (!P(bot).jokerAware) return filled;
  const totalSlots = contract.sets * 3 + contract.straights * 4;
  const jokers = hand.filter((c) => c.joker).length;
  return filled + Math.min(jokers, Math.max(0, totalSlots - filled));
}

/** Should the bot buy this discard out of turn? (respects the 3-buy game cap) */
export function botWantsBuy(bot, card, game) {
  const p = P(bot);
  if ((game.buysUsed?.[bot.id] || 0) >= game.maxBuysPerRound) return false;
  if (bot.hand.length > p.maxHand) return false; // never drown in penalty cards
  if (bot.hasGoneDown) return false; // only buy to get DOWN
  if (card.joker) return p.buyJokers;
  // The best buy there is: the card puts us down THIS turn.
  if (p.completionBuys && solveContract([...bot.hand, card], game.round)) return true;
  if (p.buyGain === Infinity) return false;
  const gain = progress(bot, [...bot.hand, card], game.round) - progress(bot, bot.hand, game.round);
  return gain >= p.buyGain;
}

/**
 * Perform ONE action-phase move (go down / lay off) through the engine.
 * Returns true if a move was made (the engine re-schedules the bot),
 * false when there is nothing left to do but discard.
 */
export function botAct(bot, game) {
  // 1. Go down when possible (going out on the go-down itself is fine).
  if (!bot.hasGoneDown) {
    const solution = solveContract(bot.hand, game.round);
    if (solution) {
      game.goDown(bot.id, solution.melds.map((m) => ({
        type: m.type,
        cardIds: m.cards.map((c) => c.id),
      })));
      return true;
    }
    return false;
  }
  // 2. Lay off. Always keep one card to discard and go out with.
  for (const card of bot.hand) {
    if (bot.hand.length === 1) break;
    for (const meld of game.tableMelds) {
      const opts = layoffOptions(card, meld);
      if (opts) {
        game.layOff(bot.id, meld.id, card.id, opts.high ? 'high' : 'low');
        return true;
      }
    }
  }
  return false;
}

/** Which card should the bot discard? */
export function botDiscard(bot, game) {
  const pendingJoker = game.mustPlayJoker[bot.id];
  if (pendingJoker) return pendingJoker; // failsafe (bots never swap, but stay safe)
  const { keep } = makePlan(bot.hand, game.round);
  const spare = bot.hand.filter((c) => !keep.has(c.id));
  const pool = spare.length > 0 ? spare : bot.hand.filter((c) => !c.joker);
  const candidates = pool.length > 0 ? pool : bot.hand;
  if (bot.difficulty === 'easy') {
    return candidates[Math.floor(Math.random() * candidates.length)].id;
  }
  const p = P(bot);
  // Endgame alarm: someone who is down is nearly out — stop speculating and
  // shed points NOW (holding a "promising" king costs 10 when they go out).
  const danger = game.players.some((o) =>
    o.id !== bot.id && o.hasGoneDown && o.hand.length <= 3);
  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    // Dump high points first…
    let score = cardPoints(c);
    // …but stronger bots keep spares that might yet join the plan (look-ahead)…
    if (p.spareWeight && !danger) score -= spareValue(c, bot.hand, game.round) * p.spareWeight;
    // …and Peggy prefers not to hand opponents a free layoff.
    if (p.denyDiscards && game.tableMelds.some((m) => layoffOptions(c, m))) score -= 6;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return (best || candidates[0]).id;
}

/** How close is this spare card to mattering? (rank pairs / suit neighbours) */
function spareValue(card, hand, roundNumber) {
  if (card.joker) return 10;
  const contract = CONTRACTS[roundNumber];
  let v = 0;
  if (contract.sets > 0) {
    v += hand.filter((c) => !c.joker && c.rank === card.rank && c.id !== card.id).length * 2;
  }
  if (contract.straights > 0) {
    for (const c of hand) {
      if (c.joker || c.suit !== card.suit || c.id === card.id) continue;
      for (const a of valuesOf(card)) {
        for (const b of valuesOf(c)) {
          const d = Math.abs(a - b);
          if (d >= 1 && d <= 2) v += 3 - d;
        }
      }
    }
  }
  return v;
}
