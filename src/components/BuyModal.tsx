import { GameState } from '../types'

type Props = {
  state: GameState
  onBuy: () => void
  onPass: () => void
}

export default function BuyModal({ state, onBuy, onPass }: Props) {
  if (!state.buying.open) return null
  const idx = state.buying.nextBuyerIndex ?? 0
  const name = state.players[idx].name
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', padding: 16, borderRadius: 12, minWidth: 280 }}>
        <h3>Buy?</h3>
        <p>{name}, do you want to buy the discard?</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onPass}>Pass</button>
          <button onClick={onBuy}>Buy</button>
        </div>
      </div>
    </div>
  )
} 