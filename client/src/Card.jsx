// Card.jsx — playing card faces, backs, avatars (lake-house art edition).
import React, { useEffect, useState } from 'react';
import { artUrl } from './socket.js';

const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const RANK_NAME = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' };

export default function Card({ card, small, big, selected, draggable, onClick, onDragStart, onDragEnd, ghost, title }) {
  if (!card) return <div className={`card-back ${small ? 'small' : ''} ${big ? 'big' : ''}`} />;
  const cls = [
    'playing-card',
    small && 'small',
    big && 'big',
    selected && 'selected',
    ghost && 'dragging',
    card.joker && 'joker',
  ].filter(Boolean).join(' ');
  const suitCls = card.suit === 'H' || card.suit === 'D' ? 'suit-red' : 'suit-black';
  return (
    <div
      className={cls}
      draggable={draggable}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={title}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick ? 0 : undefined}
      aria-label={card.joker ? 'Joker' : `${RANK_NAME[card.rank] || card.rank} of ${SUIT_NAME[card.suit]}`}
      aria-pressed={onClick ? Boolean(selected) : undefined}
      onKeyDown={onClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(event); } } : undefined}
    >
      {card.joker ? (
        <>
          <div className="pc-corner joker-corner"><span>★</span></div>
          <img className="pc-art joker-art" src={artUrl('card-joker.png')} alt="Joker" draggable={false} />
          <div className="pc-corner flip joker-corner"><span>★</span></div>
        </>
      ) : (
        <>
          <div className={`pc-corner ${suitCls}`}>
            <span>{card.rank}</span>
            <span>{SUIT_GLYPH[card.suit]}</span>
          </div>
          {['J', 'Q', 'K'].includes(card.rank) ? (
            <img
              className="pc-art court-art"
              src={artUrl(card.rank === 'K' ? 'court-king.png' : card.rank === 'Q' ? 'court-queen.png' : 'court-jack.png')}
              alt={card.rank}
              draggable={false}
            />
          ) : card.rank === 'A' ? (
            <div className={`pc-ace ${suitCls}`}>{SUIT_GLYPH[card.suit]}</div>
          ) : (
            <div className={`pc-pip ${suitCls}`}>{SUIT_GLYPH[card.suit]}</div>
          )}
          <div className={`pc-corner flip ${suitCls}`}>
            <span>{card.rank}</span>
            <span>{SUIT_GLYPH[card.suit]}</span>
          </div>
        </>
      )}
    </div>
  );
}

export function cardLabel(card) {
  if (!card) return '';
  return card.joker ? 'Joker' : `${card.rank}${SUIT_GLYPH[card.suit]}`;
}

/* ---- avatars: lake-house cast ---- */

export const ALL_AVATARS = [
  'avatar-loon.png', 'avatar-fox.png', 'avatar-chipmunk.png',
  'avatar-bear.png', 'avatar-mallard.png', 'avatar-trout.png',
];

function nameHash(name) {
  name = String(name || 'Player');
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

/** Illustrated avatar with a graceful fall-back to a colored initials disc. */
export function Avatar({ name = 'Player', isBot, avatar, size = 2.6, selected, onClick }) {
  const [broken, setBroken] = useState(false);
  const file = avatar || ALL_AVATARS[nameHash(name) % ALL_AVATARS.length];
  useEffect(() => setBroken(false), [file]);
  const style = {
    width: `${size}rem`, height: `${size}rem`, flexShrink: 0,
    border: selected ? '3px solid #af8e50' : '1px solid #bbbca9',
    background: '#dfe5d6', borderRadius: '50%', objectFit: 'cover',
  };
  const portrait = broken ? <span style={{ ...style, display: 'grid', placeItems: 'center', fontSize: `${size * .4}rem`, fontFamily: 'Georgia', color: '#203d34' }}>{name.slice(0, 2).toUpperCase()}</span>
    : <img src={artUrl(file)} alt={onClick ? '' : name} draggable={false} onError={() => setBroken(true)} style={style} />;
  return onClick ? <button className="avatar-button" type="button" onClick={onClick} aria-label={`Choose ${name} portrait`} aria-pressed={Boolean(selected)}>{portrait}</button> : portrait;
}
