export type Suit = '♠' | '♥' | '♦' | '♣'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JOKER'

export type Card = {
  id: string
  suit: Suit | null
  rank: Rank
}

export type Meld = {
  id: string
  cards: Card[]
  type: 'set' | 'run'
}

export type Player = {
  id: string
  name: string
  hand: Card[]
  melds: Meld[]
  score: number
}

export type GameState = {
  players: Player[]
  currentPlayerIndex: number
  stock: Card[]
  discard: Card[]
  round: number
  buying: {
    open: boolean
    nextBuyerIndex: number | null
  }
} 