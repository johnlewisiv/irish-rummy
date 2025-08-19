import { Card, GameState, Meld, Player } from './types'
import { createDeck, shuffle, isValidMeld } from './rules'

export function createGame(playerNames: string[]): GameState {
  const deck = shuffle(createDeck())
  const players: Player[] = playerNames.map((name, idx) => ({
    id: `P${idx+1}`,
    name,
    hand: [],
    melds: [],
    score: 0,
  }))

  // deal 10 each
  let stock = [...deck]
  for (let r = 0; r < 10; r++) {
    for (const p of players) {
      const card = stock.shift()!
      p.hand.push(card)
    }
  }

  const discard: Card[] = [stock.shift()!]

  return {
    players,
    currentPlayerIndex: 0,
    stock,
    discard,
    round: 1,
    buying: { open: false, nextBuyerIndex: null },
  }
}

export function drawStock(state: GameState): void {
  const card = state.stock.shift()
  if (card) currentPlayer(state).hand.push(card)
}

export function drawDiscard(state: GameState): void {
  const card = state.discard.pop()
  if (card) currentPlayer(state).hand.push(card)
}

export function discard(state: GameState, cardId: string): void {
  const player = currentPlayer(state)
  const idx = player.hand.findIndex(c => c.id === cardId)
  if (idx >= 0) {
    const [card] = player.hand.splice(idx, 1)
    state.discard.push(card)
    // open buying for next player
    state.buying.open = true
    state.buying.nextBuyerIndex = (state.currentPlayerIndex + 1) % state.players.length
    // advance turn
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length
  }
}

export function publishMeld(state: GameState, cardIds: string[]): boolean {
  const player = currentPlayer(state)
  const cards = cardIds.map(id => player.hand.find(c => c.id === id)!).filter(Boolean)
  const res = isValidMeld(cards)
  if (!res.valid) return false
  // remove from hand
  for (const id of cardIds) {
    const idx = player.hand.findIndex(c => c.id === id)
    if (idx >= 0) player.hand.splice(idx, 1)
  }
  const newMeld: Meld = { id: `M-${Date.now()}`, cards, type: res.type! }
  player.melds.push(newMeld)
  return true
}

export function replaceJokerInMeld(state: GameState, playerIndex: number, meldId: string, realCardId: string): boolean {
  const player = state.players[playerIndex]
  const meld = player.melds.find(m => m.id === meldId)
  if (!meld) return false
  const realCard = player.hand.find(c => c.id === realCardId)
  if (!realCard) return false
  const jokerIndex = meld.cards.findIndex(c => c.rank === 'JOKER')
  if (jokerIndex === -1) return false

  // replace
  meld.cards.splice(jokerIndex, 1, realCard)
  // take joker to hand
  player.hand.splice(player.hand.indexOf(realCard), 1)
  player.hand.push({ id: `J-rt-${Date.now()}`, suit: null, rank: 'JOKER' })
  return true
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex]
} 