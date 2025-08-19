import { useState } from 'react'
import { GameState } from './types'
import { createGame, currentPlayer, discard as discardAction, drawDiscard, drawStock, publishMeld, replaceJokerInMeld } from './state'
import { isValidMeld } from './rules'
import Hand from './components/Hand'
import Controls from './components/Controls'
import Scoreboard from './components/Scoreboard'
import MeldView from './components/MeldView'
import BuyModal from './components/BuyModal'

export default function App() {
  const [state, setState] = useState<GameState | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const me = state ? currentPlayer(state) : null
  const topDiscard = state && state.discard.length > 0 ? state.discard[state.discard.length - 1] : null

  function start(players: string[]) {
    setState(createGame(players))
    setSelectedIds([])
  }

  function mutate(fn: (s: GameState) => void) {
    setState(prev => {
      if (!prev) return prev
      const copy: GameState = JSON.parse(JSON.stringify(prev))
      fn(copy)
      return copy
    })
  }

  function handleDrawStock() {
    mutate(drawStock)
  }

  function handleDrawDiscard() {
    mutate(drawDiscard)
  }

  function handlePublish() {
    if (!state || selectedIds.length === 0) return
    mutate(s => {
      publishMeld(s, selectedIds)
    })
    setSelectedIds([])
  }

  function handleDiscard() {
    if (!state || selectedIds.length !== 1) return
    mutate(s => {
      discardAction(s, selectedIds[0])
    })
    setSelectedIds([])
  }

  function handleExtendMeld(meldId: string) {
    if (!state || selectedIds.length === 0) return
    mutate(s => {
      const player = currentPlayer(s)
      const meld = player.melds.find(m => m.id === meldId)
      if (!meld) return
      const addCards = selectedIds.map(id => player.hand.find(c => c.id === id)!).filter(Boolean)
      const combined = [...meld.cards, ...addCards]
      const res = isValidMeld(combined)
      if (!res.valid || res.type !== meld.type) return
      // remove from hand
      for (const id of selectedIds) {
        const idx = player.hand.findIndex(c => c.id === id)
        if (idx >= 0) player.hand.splice(idx, 1)
      }
      meld.cards = combined
    })
    setSelectedIds([])
  }

  function handleJokerClick(meldId: string) {
    if (!state || selectedIds.length !== 1) return
    mutate(s => {
      const ok = replaceJokerInMeld(s, s.currentPlayerIndex, meldId, selectedIds[0])
      if (ok) {
        // replaced; clear selection
      }
    })
    setSelectedIds([])
  }

  function handleBuy() {
    if (!state || state.discard.length === 0 || state.buying.nextBuyerIndex == null) return
    mutate(s => {
      const buyer = s.players[s.buying.nextBuyerIndex!]
      const card = s.discard.pop()
      if (card) buyer.hand.push(card)
      s.buying.open = false
      s.buying.nextBuyerIndex = null
    })
  }

  function handlePass() {
    mutate(s => {
      s.buying.open = false
      s.buying.nextBuyerIndex = null
    })
  }

  if (!state) {
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <h1>Irish Rummy</h1>
        <SetupForm onStart={start} />
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Round {state.round}</h2>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Scoreboard state={state} />
        <div style={{ flex: 1, minWidth: 320 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Discard:</strong>{' '}
            {topDiscard ? `${topDiscard.rank}${topDiscard.suit ?? ''}` : 'Empty'}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Current:</strong> {me?.name}
          </div>
          <Controls
            state={state}
            onDrawStock={handleDrawStock}
            onDrawDiscard={handleDrawDiscard}
            onPublish={handlePublish}
            onDiscard={handleDiscard}
          />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <strong>Your hand</strong>
        <Hand cards={me?.hand ?? []} onSelect={setSelectedIds} />
        <div style={{ color: '#666', fontSize: 12 }}>
          Selected: {selectedIds.length}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <strong>Your melds</strong>
        <div>
          {(me?.melds ?? []).map(m => (
            <div key={m.id} style={{ display: 'inline-block' }}>
              <MeldView meld={m} onClickJoker={handleJokerClick} />
              <div style={{ textAlign: 'center' }}>
                <button onClick={() => handleExtendMeld(m.id)}>Extend</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <strong>Table melds</strong>
        <div>
          {state.players.map((p, pi) => (
            <div key={p.id} style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              {p.melds.length === 0 && <div style={{ color: '#666' }}>—</div>}
              {p.melds.map(m => (
                <MeldView key={m.id} meld={m} onClickJoker={pi === state.currentPlayerIndex ? handleJokerClick : undefined} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <BuyModal state={state} onBuy={handleBuy} onPass={handlePass} />
    </div>
  )
}

function SetupForm({ onStart }: { onStart: (players: string[]) => void }) {
  const [count, setCount] = useState(3)
  const [names, setNames] = useState<string[]>(['Alice', 'Bob', 'Cara'])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const sanitized = names.map(n => n.trim()).filter(Boolean)
    if (sanitized.length >= 2) onStart(sanitized)
  }

  function changeCount(n: number) {
    setCount(n)
    setNames(prev => {
      const next = [...prev]
      while (next.length < n) next.push(`P${next.length + 1}`)
      return next.slice(0, n)
    })
  }

  return (
    <form onSubmit={submit}>
      <div style={{ marginBottom: 12 }}>
        <label>Players: </label>
        <select value={count} onChange={e => changeCount(parseInt(e.target.value))}>
          {[2,3,4,5,6].map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <div>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <label style={{ display: 'inline-block', width: 80 }}>Name {i+1}</label>
            <input
              value={names[i] ?? ''}
              onChange={e => setNames(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
            />
          </div>
        ))}
      </div>
      <button type="submit" style={{ marginTop: 8 }}>Start</button>
    </form>
  )
}
