// deck.js — physical deck construction and card utilities.
// Every card has a unique id so the full deck is tracked at all times:
// draw pile + discard pile + all hands + all melds always sum to the full deck.

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Numeric value of a rank inside a straight. A can be 1 (low) or 14 (high). */
export function rankValue(rank, aceHigh = false) {
  if (rank === 'A') return aceHigh ? 14 : 1;
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  return parseInt(rank, 10);
}

export function rankFromValue(v) {
  if (v === 1 || v === 14) return 'A';
  if (v === 11) return 'J';
  if (v === 12) return 'Q';
  if (v === 13) return 'K';
  return String(v);
}

/** Point value of a leftover card at end of round (Irish Rummy scoring). */
export function cardPoints(card) {
  if (card.joker) return 50;
  if (card.rank === 'A') return 15;
  if (['10', 'J', 'Q', 'K'].includes(card.rank)) return 10;
  return parseInt(card.rank, 10);
}

/**
 * Build the physical deck.
 * 2–4 players: 2 x 52 + 4 jokers = 108 cards.
 * 5–6 players: 3 x 52 + 6 jokers = 162 cards.
 */
export function buildDeck(playerCount) {
  const copies = playerCount >= 5 ? 3 : 2;
  const jokers = copies * 2;
  const cards = [];
  let n = 0;
  for (let c = 0; c < copies; c++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `c${n++}`, rank, suit, joker: false });
      }
    }
  }
  for (let j = 0; j < jokers; j++) {
    cards.push({ id: `c${n++}`, rank: 'JOKER', suit: null, joker: true });
  }
  return cards;
}

/** Fisher–Yates shuffle (in place). */
export function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
