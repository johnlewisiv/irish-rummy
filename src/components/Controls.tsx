import { GameState } from '../types'

type Props = {
  state: GameState
  onDrawStock: () => void
  onDrawDiscard: () => void
  onPublish: () => void
  onDiscard: () => void
}

export default function Controls({ state, onDrawStock, onDrawDiscard, onPublish, onDiscard }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      <button onClick={onDrawStock}>Draw stock ({state.stock.length})</button>
      <button onClick={onDrawDiscard} disabled={state.discard.length === 0}>Draw discard</button>
      <button onClick={onPublish}>Publish Meld</button>
      <button onClick={onDiscard} disabled={false}>Discard</button>
    </div>
  )
} 