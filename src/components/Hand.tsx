import { useState } from 'react'
import { Card as CardT } from '../types'
import Card from './Card'

type Props = {
  cards: CardT[]
  onSelect?: (ids: string[]) => void
}

export default function Hand({ cards, onSelect }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  function toggle(card: CardT) {
    const next = selected.includes(card.id)
      ? selected.filter(id => id !== card.id)
      : [...selected, card.id]
    setSelected(next)
    onSelect?.(next)
  }
  return (
    <div>
      {cards.map(c => (
        <Card key={c.id} card={c} onClick={toggle} selected={selected.includes(c.id)} />
      ))}
    </div>
  )
} 