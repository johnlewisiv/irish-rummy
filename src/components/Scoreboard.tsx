import { GameState } from '../types'

type Props = { state: GameState }

export default function Scoreboard({ state }: Props) {
  return (
    <div style={{ padding: 8, border: '1px solid #eee', borderRadius: 8 }}>
      <strong>Scores</strong>
      <ul>
        {state.players.map((p, idx) => (
          <li key={p.id} style={{ fontWeight: idx === state.currentPlayerIndex ? 700 : 400 }}>
            {p.name}: {p.score}
          </li>
        ))}
      </ul>
    </div>
  )
} 