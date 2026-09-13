// GameScreen.jsx — waiting room + the live game table.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Card, { cardLabel, Avatar, ALL_AVATARS } from './Card.jsx';
import ChatPanel from './ChatPanel.jsx';
import Icon from './Icon.jsx';
import { soundOn, toggleSound, dingTurn, chimeBuy, roundEnd as roundEndSound, fanfare } from './sounds.js';

// Older saved games include decorative prefixes in their system event text.
// Keep the event wording and suit symbols; only remove those leading prefixes.
const eventText = (text) => String(text || '').replace(/^(?:[\u{1F4B0}\u23F8\u25B6]\uFE0F?\s*)+/u, '');

const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 };
const RANK_VAL = { A: 14, K: 13, Q: 12, J: 11 };
const RANK_FROM_VALUE = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
const rv = (c) => (c.joker ? 99 : RANK_VAL[c.rank] || parseInt(c.rank, 10));
const rankFromValue = (v) => RANK_FROM_VALUE[v] || String(v);

export default function GameScreen({ state, chat, act, onLeave }) {
  const { room, game, you, role } = state;
  if (!room.started || !game) {
    return <WaitingRoom room={room} you={you} act={act} onLeave={onLeave} chat={chat} />;
  }
  return <Table room={room} game={game} you={you} role={role} act={act} onLeave={onLeave} chat={chat} />;
}

/* ================= waiting room ================= */

const BUY_TIMER_OPTIONS = [
  { value: 8000, label: '8 seconds' },
  { value: 30000, label: '30 seconds' },
  { value: 120000, label: '2 minutes' },
  { value: 3600000, label: '1 hour (check-in games)' },
  { value: 0, label: 'No timer — everyone must buy or pass' },
];

function WaitingRoom({ room, you, act, onLeave, chat }) {
  const isHost = room.hostToken === you;
  const [difficulty, setDifficulty] = useState('medium');
  const [copied, setCopied] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const mySeat = room.seats.find((seat) => seat.token === you);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  };
  return (
    <main className="waiting-shell">
      <header className="welcome-header"><span className="brand">Irish Rummy<span className="brand-period">.</span></span><button className="text-button" onClick={onLeave}><Icon name="leave" /> Back to lobby</button></header>
      <div className="waiting-heading"><div><h1>{room.name}</h1><p>A few good people. Seven rounds. One family tradition.</p></div><button onClick={copy} className="invite-code" aria-label={`Copy room code ${room.code}`}><span>{room.code}</span><small><Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied to clipboard' : 'Copy code to invite family'}</small></button></div>
      <div className="waiting-layout">
        <div className="waiting-main">
          <section className="players-section"><h2>Players <span>{room.seats.length} / 6</span></h2><ul className="waiting-players">{room.seats.map((seat) => <li key={seat.token}><Avatar name={seat.name} isBot={seat.isBot} avatar={seat.avatar} size={3.2} /><div><strong>{seat.name}{seat.token === you && ' (you)'}</strong><small>{seat.token === room.hostToken ? 'Host' : seat.isBot ? `${seat.difficulty === 'extreme' ? 'Peggy' : seat.difficulty} bot` : 'Ready for the table'}</small></div>{isHost && seat.isBot && <button onClick={() => act('room:removeBot', { token: seat.token })} className="text-button danger-link">Remove</button>}</li>)}</ul>
          {isHost && room.seats.length < 6 && <div className="bot-controls"><select aria-label="Bot difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="easy">Easy · Pippin</option><option value="medium">Medium · Tom Bombadil</option><option value="hard">Hard · Saruman</option><option value="extreme">Peggy</option></select><button onClick={() => act('room:addBot', { difficulty })} className="outline-button">Add bot</button>{difficulty === 'extreme' && <p className="form-note">Peggy learned from the nuns. She counts cards. You've been warned.</p>}</div>}
          </section>
          {mySeat && <section className="portrait-section"><h3>Choose your color</h3><div className="portrait-options">{ALL_AVATARS.map((avatar) => <Avatar key={avatar} name={mySeat.name} avatar={avatar} size={3.2} selected={mySeat.avatar === avatar} onClick={() => act('room:avatar', { avatar })} />)}</div></section>}
          <section className="timer-section"><label htmlFor="buy-timer">Buy timer</label>{isHost ? <select id="buy-timer" value={room.buyWindowMs ?? 8000} onChange={(e) => act('room:settings', { buyWindowMs: Number(e.target.value) })}>{BUY_TIMER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <p>{BUY_TIMER_OPTIONS.find((option) => option.value === (room.buyWindowMs ?? 8000))?.label}</p>}<p className="form-note">Time for everyone to buy or pass after a discard. Anyone can pause during the game.</p></section>
          <div className="waiting-actions">{isHost && <button onClick={() => act('room:start')} disabled={room.seats.length < 2} className="primary-button"><Icon name="play" /> Start game</button>}<button onClick={() => setShowRules(true)} className="text-button"><Icon name="rules" /> How to play</button>{isHost && <button onClick={() => window.confirm(`Close ${room.name}? Everyone will be returned to the lobby.`) && act('room:close', { code: room.code })} className="text-button danger-link"><Icon name="close" /> Close room</button>}</div>
          <p className="form-note">{isHost ? room.seats.length < 2 ? 'Add a bot or invite a friend. The game needs at least 2 players.' : 'Everyone here? Deal the first round when you are ready.' : 'Waiting for the host to deal the first round…'}</p>
        </div>
        <aside className="waiting-aside"><ChatPanel chat={chat} act={act} inline /></aside>
      </div>
      {showRules && <RuleBook onClose={() => setShowRules(false)} />}
    </main>
  );
}

/* ================= rule book ================= */

export function RuleBook({ onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4 py-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="How to play Irish Rummy" className="glass-panel rounded-2xl max-w-lg w-full max-h-full flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-800">
          <b className="text-lg"><Icon name="rules" /> How to play Irish Rummy</b>
          <button onClick={onClose} aria-label="Close dialog" className="text-emerald-300 hover:text-white text-lg"><Icon name="close" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm flex flex-col gap-3 text-emerald-50/90">
          <p><b className="text-amber-300">The goal:</b> seven rounds, lowest total score wins. Points are BAD — they're the cards stuck in your hand when someone goes out.</p>
          <div>
            <b className="text-amber-300">Each round you must collect:</b>
            <table className="w-full mt-1 text-xs">
              <tbody>
                {[
                  ['1', 'Two sets of 3'], ['2', 'One set + one straight'], ['3', 'Two straights'],
                  ['4', 'Three sets of 3'], ['5', 'Two sets + one straight'], ['6', 'One set + two straights'],
                  ['7', 'Three straights (12 cards dealt)'],
                ].map(([r, c]) => (
                  <tr key={r} className="border-t border-emerald-800/50">
                    <td className="py-1 font-black text-emerald-300 w-8">R{r}</td><td>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs mt-1 text-emerald-200/70">A <b>set</b> = 3+ cards of the same rank. A <b>straight</b> = 4+ cards of one suit in a row. Jokers stand in for anything.</p>
          </div>
          <p><b className="text-amber-300">Your turn:</b> draw (deck or discard) → if you have the round's combination, <b>go down</b> → once you're down, play extra cards onto anyone's melds → discard one card to finish. Empty your hand to end the round!</p>
          <p><b className="text-amber-300">Buying:</b> want a discard when it's not your turn? Buy it! You get the card <b>plus a penalty card</b> from the deck. First refusal goes clockwise from the current player — and everyone gets <b>3 buys per round</b>, refreshed at every new deal.</p>
          <p><b className="text-amber-300">Sets die, straights live:</b> cards added to a set are stuck forever. Straights can keep growing at both ends — and if a joker sits in a straight, you can swap in the real card it stands for and reuse the joker (play it before you discard!).</p>
          <p><b className="text-amber-300">Scoring the stragglers:</b> 2–9 face value · 10/J/Q/K = 10 · Ace = 15 · Joker = 50. Aunt Peggy counts every point.</p>
        </div>
      </div>
    </div>
  );
}

/* ================= the table ================= */

function Table({ room, game, you, role, act, onLeave, chat }) {
  const me = game.players.find((p) => p.id === you);
  const isPlayer = role === 'player' && !!me;
  const myTurn = isPlayer && game.currentPlayerId === you;
  const canDraw = myTurn && game.turnPhase === 'draw';
  const canAct = myTurn && game.turnPhase === 'action';
  const iRequestedBuy = game.buyRequests.includes(you);
  const contract = game.contract;

  const [selected, setSelected] = useState([]);
  const [staging, setStaging] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [order, setOrder] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [showScores, setShowScores] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [unread, setUnread] = useState(0);
  const [banner, setBanner] = useState(null);
  const [jokerChoice, setJokerChoice] = useState(null);
  const [sound, setSound] = useState(soundOn());
  const [autoPass, setAutoPass] = useState(localStorage.getItem('rummy.autopass') === '1');
  const [now, setNow] = useState(Date.now());
  const chatLen = useRef(chat.length);
  const lastRound = useRef(0);
  const wasMyTurn = useRef(false);
  const lastWindowKey = useRef(null);
  const lastPhase = useRef(game.phase);

  // Buy window countdown ticker
  const iRespondedBuy = game.buyRequests.includes(you) || game.buyPasses?.includes(you);
  const buyEligible = isPlayer && !myTurn && game.turnPhase === 'draw' && !!game.discardTop;
  useEffect(() => {
    if (!game.buyWindow) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [!!game.buyWindow]); // eslint-disable-line

  // Sounds + auto-pass on new buy windows + turn ding + title flash
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) dingTurn();
    wasMyTurn.current = myTurn;
    document.title = myTurn ? 'Your turn — Irish Rummy' : 'Irish Rummy — Aunt Peggy\'s Game';
  }, [myTurn]);
  useEffect(() => {
    // One key per window (a window is identified by the discard on offer).
    const key = game.buyWindow ? `${game.round}:${game.discardTop?.id}` : null;
    if (key && key !== lastWindowKey.current && buyEligible && !iRespondedBuy) {
      lastWindowKey.current = key;
      if (autoPass) act('game:pass');
      else chimeBuy();
    }
  }, [game.buyWindow, game.discardTop?.id, buyEligible, iRespondedBuy, autoPass]); // eslint-disable-line
  useEffect(() => {
    if (game.phase !== lastPhase.current) {
      if (game.phase === 'roundEnd') roundEndSound();
      if (game.phase === 'gameOver') fanfare();
      lastPhase.current = game.phase;
    }
  }, [game.phase]);

  // Round banner on each new round
  useEffect(() => {
    if (game.phase === 'playing' && game.round !== lastRound.current) {
      lastRound.current = game.round;
      setBanner({ round: game.round, label: contract?.label, deal: contract?.deal });
      const t = setTimeout(() => setBanner(null), 2500);
      return () => clearTimeout(t);
    }
  }, [game.round, game.phase]); // eslint-disable-line

  // Track unread chat while the panel is closed
  useEffect(() => {
    if (chat.length > chatLen.current && !showChat) setUnread((u) => u + chat.length - chatLen.current);
    chatLen.current = chat.length;
  }, [chat, showChat]);

  // Keep local hand order in sync with the server hand
  const hand = me?.hand || [];
  useEffect(() => {
    setOrder((old) => {
      const ids = hand.map((c) => c.id);
      const kept = old.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
    setSelected((sel) => sel.filter((id) => hand.some((c) => c.id === id)));
    setStaging((st) => st && st.map((slot) => slot.filter((id) => hand.some((c) => c.id === id))));
  }, [JSON.stringify(hand.map((c) => c.id))]); // eslint-disable-line

  const orderedHand = order.map((id) => hand.find((c) => c.id === id)).filter(Boolean);
  const slotTypes = useMemo(() => contract
    ? [...Array(contract.sets).fill('set'), ...Array(contract.straights).fill('straight')]
    : [], [contract]);
  const stagedIds = new Set((staging || []).flat());
  const leaderScore = Math.min(...game.players.map((p) => p.score));
  const isHost = room.hostToken === you;

  /* ---------- interactions ---------- */

  const toggleSelect = (id) => {
    if (!isPlayer) return;
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  };

  const sortRuns = () => setOrder([...hand]
    .sort((a, b) => (SUIT_ORDER[a.suit] ?? 9) - (SUIT_ORDER[b.suit] ?? 9) || rv(a) - rv(b))
    .map((c) => c.id));
  const sortSets = () => setOrder([...hand]
    .sort((a, b) => rv(a) - rv(b) || (SUIT_ORDER[a.suit] ?? 9) - (SUIT_ORDER[b.suit] ?? 9))
    .map((c) => c.id));

  const reorderTo = (targetId) => {
    if (!dragId || dragId === targetId) return;
    setOrder((old) => {
      const without = old.filter((id) => id !== dragId);
      const idx = targetId === '__end__' ? without.length : without.indexOf(targetId);
      without.splice(idx, 0, dragId);
      return without;
    });
  };

  const discardCard = (cardId) => { act('game:discard', { cardId }); setSelected([]); };

  const dropOnDiscard = () => {
    if (!canAct) return;
    const id = dragId || selected[0];
    if (id) discardCard(id);
  };

  const clickDiscardPile = () => {
    if (canDraw) return act('game:draw', { from: 'discard' });
    if (canAct && selected.length === 1) return discardCard(selected[0]);
  };

  const jokerEndChoices = (meld, card) => {
    if (!card?.joker || meld.type !== 'straight') return [];
    const lowValue = meld.startValue - 1;
    const highValue = meld.startValue + meld.cards.length;
    return [
      lowValue >= 1 && { end: 'low', label: `Low end: ${rankFromValue(lowValue)}${SUIT_GLYPH[meld.suit] || ''}` },
      highValue <= 14 && { end: 'high', label: `High end: ${rankFromValue(highValue)}${SUIT_GLYPH[meld.suit] || ''}` },
    ].filter(Boolean);
  };

  const layOffOn = (meld, cardId, end = null) => {
    const card = hand.find((c) => c.id === cardId);
    const choices = jokerEndChoices(meld, card);
    if (!end && choices.length > 1) {
      setJokerChoice({ meldId: meld.id, cardId, choices });
      return;
    }
    act('game:layOff', { meldId: meld.id, cardId, end: end || choices[0]?.end });
    setJokerChoice(null);
    setSelected([]);
  };

  const dropOnMeld = (meld) => {
    if (!canAct) return;
    const id = dragId || selected[0];
    if (id) layOffOn(meld, id);
  };

  const clickMeldCard = (meld, card) => {
    if (canAct && card.joker && meld.type === 'straight' && selected.length === 1) {
      act('game:swapJoker', { meldId: meld.id, cardId: selected[0] });
      setSelected([]);
    } else if (canAct && selected.length === 1) {
      layOffOn(meld, selected[0]);
    }
  };

  /* ---------- go-down staging ---------- */

  const openStaging = () => {
    // Pre-fill from the server's hint whenever it sees a valid arrangement.
    if (game.canGoDownHint) {
      const byType = { set: [], straight: [] };
      game.canGoDownHint.forEach((m) => byType[m.type].push(m.cardIds));
      setStaging(slotTypes.map((t) => byType[t].shift() || []));
    } else {
      setStaging(slotTypes.map(() => []));
    }
    setSelected([]);
  };
  const addSelectedToSlot = (i) => {
    setStaging((st) => {
      const next = st.map((s) => [...s]);
      const fresh = selected.filter((id) => !next.some((s) => s.includes(id)));
      next[i] = [...next[i], ...fresh];
      return next;
    });
    setSelected([]);
  };
  const clearSlot = (i) => setStaging((st) => st.map((s, j) => (j === i ? [] : s)));
  const submitGoDown = () => {
    act('game:goDown', { melds: staging.map((ids, i) => ({ type: slotTypes[i], cardIds: ids })) });
    setStaging(null);
    setSelected([]);
  };

  /* ---------- render ---------- */

  return (
    <div className="game-shell">
      <header className="game-header">
        <div className="game-title"><span className="brand brand-compact">Irish Rummy<span className="brand-period">.</span></span><span className="game-room-name">{room.name} <b>{room.code}</b>{role === 'spectator' && <small>Watching</small>}</span></div>
        <nav className="game-utilities" aria-label="Table controls">
          <button onClick={() => setShowRules(true)}><Icon name="rules" /> Rules</button><button onClick={() => setShowLog(true)}><Icon name="history" /> History</button><button onClick={() => setShowScores(true)}><Icon name="scores" /> Scores</button><button onClick={() => setSound(toggleSound())} aria-pressed={sound}><Icon name={sound ? 'sound' : 'muted'} /> Sound {sound ? 'on' : 'off'}</button><button onClick={onLeave}><Icon name="leave" /> Leave</button>
          {isHost && <button className="danger-link" onClick={() => window.confirm(`Close ${room.name}? Everyone will be returned to the lobby.`) && act('room:close', { code: room.code })}><Icon name="close" /> Close table</button>}
        </nav>
      </header>

      {/* seats */}
      <div className="player-rail">
        {game.players.map((p) => (
          <div
            key={p.id}
            className={`player-seat ${game.currentPlayerId === p.id ? 'current-seat' : ''}`}
          >
            <Avatar name={p.name} isBot={p.isBot} avatar={p.avatar} size={3.4} />
            <div>
              <div className="font-extrabold leading-tight text-sm">
                {p.score === leaderScore && game.round > 1 && <><Icon name="crown" size={14} label="Lowest score" />{' '}</>}
                {p.name}{p.id === you && <span className="text-amber-300"> ·you</span>}
                {!p.connected && !p.isBot && <span className="text-red-300"> <Icon name="alert" size={14} label="Disconnected" /></span>}
              </div>
              <div className="text-[0.7rem] text-emerald-200/75 leading-tight flex items-center gap-1.5">
                <span>{p.handCount} cards</span>
                <span>· {p.score} pts</span>
                {p.hasGoneDown && <span className="bg-emerald-500/90 text-black font-bold rounded px-1">DOWN</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="playfield" aria-label="Game table">
      <div className="round-heading"><h1>Round {game.round} <span>of 7</span></h1><p>{contract?.label}</p></div>
      {/* piles */}
      <div className="draw-area">
        <div className="text-center">
          <button type="button" disabled={!canDraw} aria-label="Draw from the deck"
            onClick={() => canDraw && act('game:draw', { from: 'deck' })}
            className={`pile-stack ${canDraw ? 'clickable cursor-pointer' : ''}`}
            title={canDraw ? 'Draw from the deck' : 'Draw pile'}
          >
            <div className="card-back big" /><div className="card-back big" /><div className="card-back big" />
          </button>
          <div className="text-xs mt-1.5 text-emerald-200/70 font-semibold">DECK · {game.drawCount}</div>
        </div>
        <div className="text-center" onDragOver={(e) => canAct && e.preventDefault()} onDrop={dropOnDiscard}>
          {game.discardTop ? (
            <div key={game.discardTop.id} className="flip-in">
              <Card card={game.discardTop} big onClick={canDraw || (canAct && selected.length === 1) ? clickDiscardPile : undefined} title={canDraw ? 'Take this card' : canAct ? 'Discard here' : ''} />
            </div>
          ) : (
            <div className="playing-card big opacity-25" />
          )}
          <div className="text-xs mt-1.5 text-emerald-200/70 font-semibold">DISCARD · {game.discardCount}</div>
        </div>
        {isPlayer && (
          <BuySidebar
            game={game} you={you} act={act} now={now}
            buyEligible={buyEligible} myTurn={myTurn}
            iRequestedBuy={iRequestedBuy}
            autoPass={autoPass}
            setAutoPass={(v) => { setAutoPass(v); localStorage.setItem('rummy.autopass', v ? '1' : '0'); }}
          />
        )}
      </div>

      {/* event ticker */}
      <div className="flex justify-center pb-2">
        <span key={game.lastEvent} className="ticker text-xs bg-black/35 rounded-full px-4 py-1 text-emerald-100/85">
          {eventText(game.lastEvent)}
        </span>
      </div>

      {/* table melds */}
      <div className="flex-1 flex flex-col">
        <div className={`table-melds ${game.tableMelds.length === 0 ? 'empty-table' : ''}`}>
          {game.tableMelds.length === 0 && (
            <div className="text-emerald-200/45 italic self-center text-center">
              <span className="empty-meld-title">Melds appear here.</span><br />
              <span className="text-xs">This round needs: <b className="text-emerald-100/70">{contract?.label}</b></span>
            </div>
          )}
          {game.tableMelds.map((meld) => (
            <Meld
              key={meld.id}
              meld={meld}
              owner={game.players.find((p) => p.id === meld.ownerId)}
              active={canAct && me?.hasGoneDown}
              onDrop={() => dropOnMeld(meld)}
              onCardClick={(card) => clickMeldCard(meld, card)}
            />
          ))}
        </div>
      </div>

      </section>
      {/* status strip */}
      <div className="turn-status" role="status">
        {game.mustPlayJoker && (
          <span className="bg-purple-600 rounded-lg px-3 py-1 font-bold shadow"><Icon name="alert" size={16} /> Play the joker you took before discarding!</span>
        )}
        {!game.mustPlayJoker && canDraw && !game.buyWindow?.pendingDraw && (
          <span className="text-amber-300 font-extrabold">Your turn! Draw from the deck, or take the {cardLabel(game.discardTop)}.</span>
        )}
        {myTurn && game.buyWindow?.pendingDraw && (
          <span className="text-emerald-200/85">
            Waiting for others to buy or pass…{' '}
            {game.buyWindow.paused ? '(paused)'
              : game.buyWindow.untimed ? `(waiting on ${game.buyWindow.waitingOn?.join(', ') || 'everyone'})`
              : `(${Math.max(0, Math.ceil((game.buyWindow.expiresAt - now) / 1000))}s)`}
          </span>
        )}
        {!game.mustPlayJoker && canAct && !staging && (
          <span className="text-amber-100/90">
            {me.hasGoneDown
              ? 'Select a card and click a meld to play it — then discard to end your turn.'
              : game.canGoDownHint
                ? 'You can go down!'
                : 'Discard a card to end your turn.'}
          </span>
        )}
        {isPlayer && !myTurn && game.phase === 'playing' && !game.mustPlayJoker && (
          <span className="text-emerald-200/55">Waiting for <b>{game.players.find((p) => p.id === game.currentPlayerId)?.name}</b>…</span>
        )}
      </div>

      {/* go-down staging area */}
      {staging && canAct && !me.hasGoneDown && (
        <div className="glass-panel rounded-2xl p-3 mb-2">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <b>Going down — {contract.label}</b>
            <button onClick={() => setStaging(null)} className="bg-emerald-900 hover:bg-emerald-800 rounded-lg px-3 py-1 text-sm">Cancel</button>
          </div>
          <div className="flex flex-wrap gap-3">
            {staging.map((ids, i) => (
              <div key={i} className="bg-emerald-950/70 rounded-xl p-2 min-w-[10.5rem]">
                <div className="text-xs mb-1 flex justify-between gap-3">
                  <span className="font-extrabold">{slotTypes[i] === 'set' ? 'SET of 3' : 'STRAIGHT of 4+'}</span>
                  <span>
                    <button onClick={() => addSelectedToSlot(i)} className="text-amber-300 hover:text-amber-200 font-bold mr-2" title="Add selected cards (straights: select low → high)">+ add</button>
                    <button onClick={() => clearSlot(i)} className="text-red-300 hover:text-red-200">clear</button>
                  </span>
                </div>
                <div className="flex gap-1 min-h-[4.2rem]">
                  {ids.map((id) => {
                    const c = hand.find((x) => x.id === id);
                    return c ? (
                      <Card key={id} card={c} small
                        onClick={() => setStaging((st) => st.map((s, j) => (j === i ? s.filter((x) => x !== id) : s)))} />
                    ) : null;
                  })}
                  {ids.length === 0 && <span className="text-emerald-200/40 text-xs self-center px-2">select cards below, then "+ add"</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="text-right mt-2">
            <button
              onClick={submitGoDown}
              disabled={staging.some((s, i) => s.length < (slotTypes[i] === 'set' ? 3 : 4))}
              className="bg-amber-400 disabled:opacity-40 hover:bg-amber-300 text-black font-black rounded-xl px-7 py-2.5 shadow-lg"
            >
              <Icon name="down" /> Go down
            </button>
          </div>
        </div>
      )}

      {/* action bar */}
      {isPlayer && (
        <div className="flex flex-wrap items-center justify-center gap-2 py-1.5">
          {canAct && !me.hasGoneDown && !staging && (
            <button
              onClick={openStaging}
              className={`${game.canGoDownHint ? 'bg-amber-400 hover:bg-amber-300' : 'bg-amber-400/60 hover:bg-amber-300'} text-black font-extrabold rounded-xl px-5 py-2 shadow-lg`}
            >
              <Icon name="down" /> Go down{game.canGoDownHint ? ' — ready!' : ''}
            </button>
          )}
          {canAct && (
            <button
              onClick={() => selected.length === 1 && discardCard(selected[0])}
              disabled={selected.length !== 1}
              className="bg-red-500 disabled:opacity-35 hover:bg-red-400 text-white font-extrabold rounded-xl px-5 py-2 shadow-lg"
            >
              Discard {selected.length === 1 ? cardLabel(hand.find((c) => c.id === selected[0])) : ''}
            </button>
          )}
        </div>
      )}

      {/* your hand */}
      {isPlayer && (
        <div
          className="hand-band"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => reorderTo('__end__')}
        >
          <div className="text-xs text-emerald-200/70 mb-0.5 flex justify-between items-center flex-wrap gap-1">
            <span className="font-semibold">Your hand · {hand.length} cards · {hand.reduce((s, c) => s + points(c), 0)} pts if caught</span>
            <span className="flex gap-1.5">
              <button onClick={sortRuns} className="bg-emerald-900/80 hover:bg-emerald-800 rounded px-2 py-0.5" title="Sort by suit, then rank — good for straights">Sort by suit</button>
              <button onClick={sortSets} className="bg-emerald-900/80 hover:bg-emerald-800 rounded px-2 py-0.5" title="Sort by rank — good for sets">Sort by rank</button>
            </span>
          </div>
          <div className="fan">
            {orderedHand.map((c) => (
              <div key={c.id} className="fan-slot" style={selected.includes(c.id) || stagedIds.has(c.id) ? { zIndex: 5 } : undefined}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => { e.stopPropagation(); reorderTo(c.id); }}
              >
                <Card
                  card={c}
                  draggable
                  ghost={dragId === c.id}
                  selected={selected.includes(c.id) || stagedIds.has(c.id)}
                  onClick={() => toggleSelect(c.id)}
                  onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => setDragId(null)}
                />
              </div>
            ))}
            {hand.length === 0 && <span className="text-emerald-200/50 italic py-4">No cards left.</span>}
          </div>
        </div>
      )}

      {/* chat toggle */}
      <button
        onClick={() => { setShowChat((s) => !s); setUnread(0); }}
        className="chat-toggle" aria-label={`Table chat${unread ? `, ${unread} unread messages` : ''}`} aria-expanded={showChat}
        title="Chat"
      >
        <Icon name="chat" /> Chat{unread > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{unread}</span>}
      </button>
      {showChat && (
        <div className="fixed bottom-20 right-4 w-80 max-w-[90vw] z-40">
          <ChatPanel chat={chat} act={act} onClose={() => setShowChat(false)} />
        </div>
      )}

      {/* overlays */}
      {banner && game.phase === 'playing' && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="round-banner glass-panel rounded-3xl px-10 py-7 text-center shadow-2xl">
            <div className="text-emerald-300/80 font-bold tracking-[0.3em] text-sm">ROUND</div>
            <div className="text-6xl font-black text-amber-300">{banner.round}</div>
            <div className="text-lg font-extrabold mt-1">{banner.label}</div>
            <div className="text-xs text-emerald-200/70 mt-1">{banner.deal} cards dealt</div>
          </div>
        </div>
      )}
      {showScores && <Scoreboard players={game.players} round={game.round} onClose={() => setShowScores(false)} />}
      {showLog && <LogDrawer log={game.log || []} buys={game.buys || []} onClose={() => setShowLog(false)} />}
      {showRules && <RuleBook onClose={() => setShowRules(false)} />}
      {jokerChoice && (
        <JokerEndChooser
          choices={jokerChoice.choices}
          onChoose={(end) => {
            const meld = game.tableMelds.find((m) => m.id === jokerChoice.meldId);
            if (meld) layOffOn(meld, jokerChoice.cardId, end);
          }}
          onCancel={() => setJokerChoice(null)}
        />
      )}
      {game.phase === 'roundEnd' && game.roundSummary && <RoundSummary summary={game.roundSummary} />}
      {game.phase === 'gameOver' && <GameOver players={game.players} onLeave={onLeave} />}
    </div>
  );
}

/* ================= pieces ================= */

/**
 * Buy-or-pass panel next to the piles. Every fresh discard opens a window:
 * respond with Buy or Pass. Timed windows can be PAUSED by anyone; casual
 * (no-timer) games simply wait for everyone.
 */
function BuySidebar({ game, you, act, now, buyEligible, myTurn, iRequestedBuy, autoPass, setAutoPass }) {
  const iPassed = game.buyPasses?.includes(you);
  const me = game.players.find((p) => p.id === you);
  const buysLeft = Math.max(0, (game.maxBuysPerRound ?? 3) - (me?.buysUsed ?? 0));
  const win = game.buyWindow;
  const timed = win && !win.untimed;
  const secsLeft = timed && !win.paused && win.expiresAt ? Math.max(0, (win.expiresAt - now) / 1000) : 0;
  const pct = timed && !win.paused && win.expiresAt
    ? Math.max(0, Math.min(100, (secsLeft * 1000 / win.windowMs) * 100)) : 0;
  return (
    <div className="buy-sidebar flex flex-col gap-1.5">
      {buyEligible && !iRequestedBuy && !iPassed && (
        <div className="buy-actions flex gap-1.5">
          <button
            onClick={() => act('game:buy')}
            disabled={buysLeft === 0}
            className="flex-1 bg-amber-400 disabled:opacity-40 text-black hover:bg-amber-300 font-extrabold rounded-xl px-2 py-2 shadow-lg"
            title={buysLeft === 0 ? 'No buys left this round — they come back next round' : `Buy the top discard (+1 penalty card). ${buysLeft} left this round.`}
          >
            Buy ({buysLeft})
          </button>
          <button
            onClick={() => act('game:pass')}
            className="flex-1 bg-emerald-900/90 hover:bg-emerald-800 font-bold rounded-xl px-2 py-2 shadow-lg"
            title="Pass on this card"
          >
            Pass
          </button>
        </div>
      )}
      {buyEligible && iRequestedBuy && (
        <>
          <button onClick={() => act('game:cancelBuy')} className="bg-red-500 text-white font-extrabold rounded-xl px-3 py-2 shadow-lg"><Icon name="close" size={16} /> Cancel buy</button>
          <span className="text-[0.7rem] text-amber-200/90 leading-snug">
            You'll get the {cardLabel(game.discardTop)} + a penalty card if {game.players.find((p) => p.id === game.currentPlayerId)?.name} draws from the deck.
          </span>
        </>
      )}
      {buyEligible && iPassed && (
        <span className="text-center text-[0.75rem] text-emerald-200/70 bg-black/25 rounded-lg py-1.5"><Icon name="check" size={14} /> Passed on the {cardLabel(game.discardTop)}</span>
      )}

      {/* countdown / paused / casual state + pause control */}
      {win && (
        <div className="flex flex-col gap-1">
          {timed && !win.paused && (
            <>
              <div className="buy-bar-track"><div className="buy-bar-fill" style={{ width: `${pct}%` }} /></div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[0.7rem] text-amber-200/90">{cardLabel(game.discardTop)} · {Math.ceil(secsLeft)}s</span>
                <button onClick={() => act('game:pauseBuy')} className="bg-emerald-900/90 hover:bg-emerald-800 rounded-lg px-2 py-1 text-xs font-bold" title="Pause the timer and think"><Icon name="pause" size={14} /> Pause</button>
              </div>
            </>
          )}
          {timed && win.paused && (
            <div className="flex items-center justify-between gap-1 bg-purple-900/60 rounded-lg px-2 py-1.5">
              <span className="text-[0.75rem] font-bold text-purple-200">Paused</span>
              <button onClick={() => act('game:resumeBuy')} className="bg-amber-400 hover:bg-amber-300 text-black rounded-lg px-2.5 py-1 text-xs font-extrabold"><Icon name="play" size={14} /> Resume</button>
            </div>
          )}
          {win.untimed && (
            <span className="text-[0.7rem] text-emerald-200/75 text-center bg-black/25 rounded-lg py-1">
              casual game — waiting for {win.waitingOn?.length ? win.waitingOn.join(', ') : 'everyone'} to buy or pass
            </span>
          )}
        </div>
      )}

      {/* always available — it's hard to click when the table moves fast */}
      <label className="flex items-center gap-1.5 text-[0.7rem] text-emerald-200/60 cursor-pointer select-none justify-center">
        <input type="checkbox" checked={autoPass} onChange={(e) => setAutoPass(e.target.checked)} className="accent-amber-400" />
        auto-pass every buy window
      </label>
      {!buyEligible && !myTurn && game.buyRequests.length > 0 && (
        <span className="text-[0.7rem] text-amber-200/80 text-center">{game.buyRequests.length} buy request{game.buyRequests.length > 1 ? 's' : ''} pending…</span>
      )}
    </div>
  );
}

function JokerEndChooser({ choices, onChoose, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4" onClick={onCancel}>
      <div className="glass-panel rounded-2xl p-5 max-w-sm w-full shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-amber-300 mb-2">Place the joker</h2>
        <p className="text-sm text-emerald-100/80 mb-4">
          This joker can extend either end of the straight.
        </p>
        <div className="flex flex-col gap-2">
          {choices.map((choice) => (
            <button
              key={choice.end}
              onClick={() => onChoose(choice.end)}
              className="bg-amber-400 hover:bg-amber-300 text-black font-black rounded-xl px-4 py-3 shadow-lg"
            >
              {choice.label}
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="mt-4 text-sm text-emerald-200/70 hover:text-white">Cancel</button>
      </div>
    </div>
  );
}

/** Full game record: buy ledger on top, every event below. */
function LogDrawer({ log, buys, onClose }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView(); }, [log.length]);
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-end" onClick={onClose}>
      <div className="glass-panel h-full w-96 max-w-[92vw] flex flex-col rounded-l-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-800">
          <b><Icon name="history" /> Game log</b>
          <button onClick={onClose} aria-label="Close dialog" className="text-emerald-300 hover:text-white text-lg"><Icon name="close" /></button>
        </div>
        <div className="px-4 py-3 border-b border-emerald-800/60">
          <div className="text-xs font-black text-amber-300 mb-1.5 tracking-wide">BUYS THIS GAME</div>
          {buys.length === 0 ? (
            <div className="text-xs text-emerald-200/50 italic">No one has bought a card yet.</div>
          ) : (
            <ul className="text-sm flex flex-col gap-0.5 max-h-36 overflow-y-auto">
              {buys.map((b, i) => (
                <li key={i}>
                  <span className="text-emerald-300/60 text-xs">R{b.round}</span>{' '}
                  <b className="text-amber-200">{b.name}</b> bought the <b>{b.card}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2 text-[0.8rem] flex flex-col gap-1">
          {log.map((e, i) => (
            <div key={i} className={
              e.type === 'buy' ? 'text-amber-200 font-semibold'
                : e.type === 'round' ? 'text-emerald-300 font-black pt-2'
                : 'text-emerald-100/75'
            }>
              {eventText(e.msg)}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

function Meld({ meld, owner, active, onDrop, onCardClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`rounded-xl px-2 pb-2 pt-1 bg-emerald-950/55 border border-white/5 ${hover && active ? 'drop-target' : ''}`}
      onDragOver={(e) => { if (active) { e.preventDefault(); setHover(true); } }}
      onDragLeave={() => setHover(false)}
      onDrop={() => { setHover(false); onDrop(); }}
    >
      <div className="text-[0.65rem] text-emerald-200/70 mb-1 font-semibold">
        {owner?.name} · {meld.type === 'set' ? `${meld.rank}s (dead)` : 'straight (live)'}
      </div>
      <div className="flex" style={{ paddingRight: '0.4rem' }}>
        {meld.cards.map((c, i) => (
          <div key={c.id} style={{ marginLeft: i === 0 ? 0 : '-1rem' }}>
            <Card
              card={c}
              small
              onClick={() => onCardClick(c)}
              title={c.joker && meld.type === 'straight' ? `Joker standing in for the ${meld.repr?.[i]?.rank} — swap it with the real card!` : ''}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Scoreboard({ players, round, onClose }) {
  const rounds = Array.from({ length: round }, (_, i) => i + 1);
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="glass-panel rounded-2xl p-5 max-w-lg w-full shadow-2xl overflow-x-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-black"><Icon name="scores" /> Scoreboard</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-emerald-300 hover:text-white text-lg"><Icon name="close" /></button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-emerald-300/70 text-right">
              <th className="text-left pb-1">Player</th>
              {rounds.map((r) => <th key={r} className="pb-1 px-1.5">R{r}</th>)}
              <th className="pb-1 pl-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {[...players].sort((a, b) => a.score - b.score).map((p) => (
              <tr key={p.id} className="border-t border-emerald-800/50 text-right">
                <td className="py-1.5 text-left font-bold">{p.name}</td>
                {rounds.map((r) => <td key={r} className="px-1.5 text-emerald-100/80">{p.roundScores[r - 1] ?? '—'}</td>)}
                <td className="pl-2 font-black text-amber-300">{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-emerald-200/60 mt-3">Lowest total after round 7 wins. 2–9 face value · 10/J/Q/K = 10 · Ace = 15 · Joker = 50.</p>
      </div>
    </div>
  );
}

function RoundSummary({ summary }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="glass-panel rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <h2 className="text-xl font-black mb-1">Round {summary.round} over!</h2>
        <p className="text-emerald-200/85 mb-3"><b>{summary.winner}</b> went out.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-emerald-300/70 text-left">
              <th className="pb-1">Player</th><th className="pb-1 text-right">This round</th><th className="pb-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {summary.scores.map((s) => (
              <tr key={s.id} className="border-t border-emerald-800/50">
                <td className="py-1.5">{s.name}</td>
                <td className="py-1.5 text-right">{s.roundPoints > 0 ? `+${s.roundPoints}` : '0'}</td>
                <td className="py-1.5 text-right font-black">{s.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-center text-emerald-200/60 text-sm mt-4 animate-pulse">Next round starting…</p>
      </div>
    </div>
  );
}

function GameOver({ players, onLeave }) {
  const standings = [...players].sort((a, b) => a.score - b.score);
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 overflow-hidden">
      <div className="glass-panel !border-amber-500/50 rounded-3xl p-7 max-w-md w-full shadow-2xl text-center">
        <div className="mb-2"><Icon name="crown" size={34} /></div>
        <h2 className="text-3xl font-black mb-1 text-amber-300">{standings[0].name} wins!</h2>
        <p className="text-emerald-200/70 mb-4">Lowest score after seven rounds — Aunt Peggy would be proud.</p>
        <table className="w-full text-sm mb-5">
          <tbody>
            {standings.map((p, i) => (
              <tr key={p.id} className="border-t border-emerald-800/50">
                <td className="py-1.5 text-left font-bold">{i + 1}. {p.name}</td>
                <td className="py-1.5 text-right text-xs text-emerald-300/70">{p.roundScores.join(' + ')}</td>
                <td className="py-1.5 text-right font-black">{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={onLeave} className="bg-amber-400 hover:bg-amber-300 text-black font-black rounded-xl px-8 py-2.5 shadow-lg">
          <Icon name="leave" /> Back to lobby
        </button>
      </div>
    </div>
  );
}

function points(c) {
  if (c.joker) return 50;
  if (c.rank === 'A') return 15;
  if (['10', 'J', 'Q', 'K'].includes(c.rank)) return 10;
  return parseInt(c.rank, 10);
}
