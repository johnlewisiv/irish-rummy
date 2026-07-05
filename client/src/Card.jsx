// Card.jsx — playing card faces, backs, avatars (lake-house art edition).
import React, { useState } from 'react';
import { artUrl } from './socket.js';

const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };

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
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

/** Illustrated avatar with a graceful fall-back to a colored initials disc. */
export function Avatar({ name, isBot, avatar, size = 2.6, selected, onClick }) {
  const [broken, setBroken] = useState(false);
  const file = avatar || ALL_AVATARS[nameHash(name) % ALL_AVATARS.length];
  const h = nameHash(name) % 360;
  if (broken) {
    return (
      <div
        className="rounded-full flex items-center justify-center font-black shadow-md shrink-0"
        style={{
          width: `${size}rem`, height: `${size}rem`, fontSize: `${size * 0.42}rem`,
          background: `linear-gradient(145deg, hsl(${h} 55% 48%), hsl(${h} 60% 32%))`,
          border: '2px solid rgba(255,255,255,0.35)',
        }}
      >
        {isBot ? '🤖' : name.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={artUrl(file)}
      alt={name}
      draggable={false}
      onError={() => setBroken(true)}
      onClick={onClick}
      className={`rounded-full shadow-md shrink-0 object-cover ${onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
      style={{
        width: `${size}rem`, height: `${size}rem`,
        border: selected ? '3px solid #fbbf24' : '2px solid rgba(245, 235, 210, 0.55)',
        background: `hsl(${h} 35% 25%)`,
      }}
    />
  );
}
