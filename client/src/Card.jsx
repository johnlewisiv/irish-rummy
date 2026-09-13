import React from 'react';

const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const RANK_NAME = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' };
const rows = (ys) => ys.flatMap((y) => [[26, y], [74, y]]);
const PIPS = {
  2: [[50, 20], [50, 80]], 3: [[50, 20], [50, 50], [50, 80]],
  4: rows([20, 80]), 5: [...rows([20, 80]), [50, 50]],
  6: rows([20, 50, 80]), 7: [...rows([20, 50, 80]), [50, 35]],
  8: [...rows([20, 50, 80]), [50, 35], [50, 65]],
  9: [...rows([14, 38, 62, 86]), [50, 50]],
  10: [...rows([14, 38, 62, 86]), [50, 26], [50, 74]],
};

function Suit({ suit, className = '', style }) {
  const paths = {
    H: 'M12 21C9 17 2 12 2 7.5 2 1.5 9 1 12 6c3-5 10-4.5 10 1.5C22 12 15 17 12 21Z',
    D: 'M12 1 22 12 12 23 2 12Z',
    S: 'M12 1C9 5 2 10 2 14.5 2 20 8 21 11 17l-2 6h6l-2-6c3 4 9 3 9-2.5C22 10 15 5 12 1Z',
    C: 'M12 1a5 5 0 0 0-4.5 7.2A5.5 5.5 0 1 0 10.6 18L9 23h6l-1.6-5a5.5 5.5 0 1 0 3.1-9.8A5 5 0 0 0 12 1Z',
  };
  return <svg className={`suit-symbol ${className}`} style={style} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d={paths[suit] || paths.S} /></svg>;
}

export default function Card({ card, small, big, selected, draggable, onClick, onDragStart, onDragEnd, ghost, title }) {
  if (!card) return <div className={`card-back ${small ? 'small' : ''} ${big ? 'big' : ''}`} aria-hidden="true" />;
  const suitClass = card.suit === 'H' || card.suit === 'D' ? 'suit-red' : 'suit-black';
  const cls = ['playing-card', suitClass, small && 'small', big && 'big', selected && 'selected', ghost && 'dragging', card.joker && 'joker'].filter(Boolean).join(' ');
  const corner = <><span>{card.joker ? 'J' : card.rank}</span>{card.joker ? <span className="joker-index">R</span> : <Suit suit={card.suit} />}</>;
  return <div className={cls} draggable={draggable} onClick={onClick} onDragStart={onDragStart} onDragEnd={onDragEnd} title={title}
    role={onClick ? 'button' : 'img'} tabIndex={onClick ? 0 : undefined}
    aria-label={card.joker ? 'Joker' : `${RANK_NAME[card.rank] || card.rank} of ${SUIT_NAME[card.suit]}`}
    aria-pressed={onClick ? Boolean(selected) : undefined}
    onKeyDown={onClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(event); } } : undefined}>
    <div className="pc-corner" aria-hidden="true">{corner}</div>
    {card.joker ? <div className="joker-center" aria-hidden="true"><span>JOKER</span><div><Suit suit="S" /><Suit suit="H" /><Suit suit="C" /><Suit suit="D" /></div><span className="joker-inverse">JOKER</span></div>
      : ['J', 'Q', 'K'].includes(card.rank) ? <div className={`court-print court-${card.rank}`} aria-hidden="true" />
      : card.rank === 'A' ? <div className="pc-ace"><Suit suit={card.suit} /></div>
      : <div className="pc-pips" aria-hidden="true">{(PIPS[card.rank] || []).map(([x, y], i) => <Suit key={i} suit={card.suit} className={y > 50 ? 'pip inverted' : 'pip'} style={{ left: `${x}%`, top: `${y}%` }} />)}</div>}
    <div className="pc-corner flip" aria-hidden="true">{corner}</div>
  </div>;
}

export function cardLabel(card) { return !card ? '' : card.joker ? 'Joker' : `${card.rank}${SUIT_GLYPH[card.suit]}`; }

// Keep saved avatar identifiers compatible with existing family games.
export const ALL_AVATARS = ['avatar-loon.png', 'avatar-fox.png', 'avatar-chipmunk.png', 'avatar-bear.png', 'avatar-mallard.png', 'avatar-trout.png'];
const COLORS = ['blue', 'brick', 'sage', 'ochre', 'plum', 'teal'];
function nameHash(name) { let h = 0; for (const c of String(name || 'Player')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

export function Avatar({ name = 'Player', isBot, avatar, size = 2.6, selected, onClick }) {
  const color = COLORS[Math.max(0, avatar ? ALL_AVATARS.indexOf(avatar) : nameHash(name) % COLORS.length)];
  const initials = String(name).trim().split(/\s+/).slice(0, 2).map((word) => word[0] || '').join('').toUpperCase() || '?';
  const disc = <span className={`player-monogram monogram-${color} ${selected ? 'monogram-selected' : ''}`} style={{ width: `${size}rem`, height: `${size}rem`, fontSize: `${size * .36}rem` }} role={onClick ? undefined : 'img'} aria-label={onClick ? undefined : `${name}${isBot ? ', bot' : ''}`}>{initials}</span>;
  return onClick ? <button className="avatar-button" type="button" onClick={onClick} aria-label={`Choose ${color} player color`} aria-pressed={Boolean(selected)}>{disc}</button> : disc;
}
