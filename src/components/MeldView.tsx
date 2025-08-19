import { Meld } from '../types'
import Card from './Card'

type Props = {
  meld: Meld
  onClickJoker?: (meldId: string) => void
}

export default function MeldView({ meld, onClickJoker }: Props) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', margin: 8, padding: 8, border: '1px solid #eee', borderRadius: 8 }}>
      {meld.cards.map(c => (
        <Card
          key={c.id}
          card={c}
          onClick={c.rank === 'JOKER' ? () => onClickJoker?.(meld.id) : undefined}
        />
      ))}
    </div>
  )
} 