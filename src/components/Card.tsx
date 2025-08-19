import { Card as CardT } from '../types'

type Props = {
  card: CardT
  onClick?: (card: CardT) => void
  selected?: boolean
}

export default function Card({ card, onClick, selected }: Props) {
  const isRed = card.suit === '♥' || card.suit === '♦'
  return (
    <button
      onClick={() => onClick?.(card)}
      style={{
        width: 60,
        height: 90,
        borderRadius: 8,
        border: selected ? '2px solid #0a84ff' : '1px solid #ddd',
        background: '#fff',
        color: isRed ? '#d11' : '#111',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 700 }}>
        {card.rank === 'JOKER' ? '🃏' : `${card.rank}${card.suit ?? ''}`}
      </span>
    </button>
  )
} 