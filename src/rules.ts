import { Card, Meld, Rank, Suit } from './types'

const SUITS: Suit[] = ['♠', '♥', '♦', '♣']
const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']

export function createDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}-${rank}-${cryptoRandom()}`, suit, rank })
    }
  }
  // two jokers
  deck.push({ id: `JOKER-1-${cryptoRandom()}`, suit: null, rank: 'JOKER' })
  deck.push({ id: `JOKER-2-${cryptoRandom()}`, suit: null, rank: 'JOKER' })
  return deck
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 9)
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function canMakeSet(cards: Card[]): boolean {
  const withoutJokers = cards.filter(c => c.rank !== 'JOKER')
  if (withoutJokers.length === 0) return false
  const ranks = new Set(withoutJokers.map(c => c.rank))
  if (ranks.size !== 1) return false
  const suits = new Set(withoutJokers.map(c => c.suit))
  return suits.size === withoutJokers.length // distinct suits
}

export function rankValue(rank: Rank): number {
  if (rank === 'A') return 1
  if (rank === 'J') return 11
  if (rank === 'Q') return 12
  if (rank === 'K') return 13
  if (rank === 'JOKER') return 0
  return parseInt(rank, 10)
}

export function canMakeRun(cards: Card[]): boolean {
  const nonJokers = cards.filter(c => c.rank !== 'JOKER')
  if (nonJokers.length === 0) return false
  const suit = nonJokers[0].suit
  if (!nonJokers.every(c => c.suit === suit)) return false
  const values = nonJokers.map(c => rankValue(c.rank)).sort((a,b)=>a-b)
  let gaps = 0
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i-1]
    if (diff === 0) return false
    if (diff > 1) gaps += diff - 1
  }
  const jokerCount = cards.length - nonJokers.length
  return gaps <= jokerCount
}

export function isValidMeld(cards: Card[]): { valid: boolean, type?: Meld['type'] } {
  if (cards.length < 3) return { valid: false }
  if (canMakeSet(cards)) return { valid: true, type: 'set' }
  if (cards.length >= 4 && canMakeRun(cards)) return { valid: true, type: 'run' }
  return { valid: false }
}

export function scoreCard(card: Card): number {
  if (card.rank === 'JOKER') return 25
  const v = rankValue(card.rank)
  if (v === 1) return 15
  if (v >= 10) return 10
  return v
}

export function handScore(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + scoreCard(c), 0)
} 