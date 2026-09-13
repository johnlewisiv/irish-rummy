// GameScreen.jsx — waiting room + the live game table.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Card, { cardLabel, Avatar } from './Card.jsx';
import ChatPanel from './ChatPanel.jsx';
import Icon from './Icon.jsx';
import DecisionDock from './DecisionDock.jsx';
import JoinRequests from './JoinRequests.jsx';
import './game-v2.css';
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

export default function GameScreen({ state, chat, act, onLeave, health, busy = false }) {
  const { room, game, you, role } = state;
  if (!room.started || !game) {
    return <WaitingRoom room={room} you={you} act={act} onLeave={onLeave} chat={chat} health={health} externalBusy={busy} />;
  }
  return <Table room={room} game={game} you={you} role={role} health={health} act={act} onLeave={onLeave} chat={chat} externalBusy={busy} />;
}

/* ================= waiting room ================= */

const BUY_TIMER_OPTIONS = [
  { value: 8000, label: '8 seconds' },
  { value: 30000, label: '30 seconds' },
  { value: 120000, label: '2 minutes' },
  { value: 3600000, label: '1 hour (check-in games)' },
  { value: 0, label: 'No timer — everyone must buy or pass' },
];

function WaitingRoom({ room, you, act, onLeave, chat, health, externalBusy }) {
  const isHost = room.hostToken === you;
  const [difficulty, setDifficulty] = useState('medium');
  const [invite, setInvite] = useState('');
  const [copied, setCopied] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [actionBusy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const busy = actionBusy || externalBusy;
  const locked = busy || (health && (!health.connected || !health.sessionReady || health.recovering || health.serverState === 'paused'));
  const send = async (event, payload) => {
    if (actionPending.current || locked) return {ok:false};
    actionPending.current = true; setBusy(true);
    try { return await act(event, payload); } finally { actionPending.current = false; setBusy(false); }
  };
  const copyInvite = async () => {
    const result = await send('room:invite');
    if (!result?.inviteToken) return;
    const link = invitationLink(result);
    setInvite(link);
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  };
  return <main className="waiting-v2">
    <header className="waiting-header"><button className="text-button" disabled={busy} onClick={onLeave}>‹ My games</button><span className="brand">Irish Rummy</span><button className="text-button" onClick={() => setShowRules(true)}>Rules</button></header>
    {externalBusy && <p role="status" className="form-note">Preparing your practice table…</p>}
    <div className="waiting-title"><h1>{room.name}</h1><p>{room.visibility === 'practice' ? 'Practice with bots' : 'Private table · Invitation only'}</p></div>
    <section><div className="section-heading"><h2>Players</h2><span>{room.seats.length} / 6</span></div>
      <ul className="waiting-players">{room.seats.map(seat => <li key={seat.token}><Avatar name={seat.name} avatar={seat.avatar} photoUrl={seat.photoUrl} isBot={seat.isBot} size={3.2} /><div><strong>{seat.name}{seat.token === you ? ' · You' : ''}</strong><small>{seat.isBot ? `${seat.difficulty === 'extreme' ? 'Expert' : seat.difficulty} bot` : seat.token === room.hostToken ? 'Host' : 'Ready'}</small></div>{isHost && seat.isBot && <button disabled={locked} onClick={() => send('room:removeBot',{token:seat.token})} className="text-button">Remove</button>}</li>)}</ul>
      {isHost && room.seats.length < 6 && <div className="bot-controls"><select disabled={locked} aria-label="Bot difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value="easy">Riley · Easy</option><option value="medium">Morgan · Medium</option><option value="hard">Casey · Hard</option><option value="extreme">Jordan · Expert (sees the deck)</option></select><button disabled={locked} onClick={() => send('room:addBot',{difficulty})} className="outline-button">Add bot</button></div>}
    </section>
    {isHost && room.visibility !== 'practice' && <div className="waiting-invite"><p className="form-note">Game code <strong>{room.code}</strong> · You approve code requests.</p><button className="outline-button" disabled={locked} onClick={copyInvite}>{copied ? 'Invitation copied' : 'Copy invitation link'}</button>{invite && <input aria-label="Invitation link" readOnly value={invite} onFocus={e=>e.target.select()} />}</div>}
    {isHost && room.joinRequests?.length > 0 && <JoinRequests requests={room.joinRequests} act={send} disabled={locked} />}
    <div className="waiting-actions">{isHost ? <button disabled={locked || room.seats.length < 2} onClick={()=>send('room:start')} className="primary-button">Start game</button> : <p>Waiting for the host to start.</p>}<button className="text-button" onClick={()=>setShowChat(true)}>Table chat</button></div>
    {isHost && room.seats.length < 2 && <p className="form-note">Add a bot or invite someone to join.</p>}
    <details className="waiting-settings"><summary>Table settings</summary><label htmlFor="buy-timer">Time to buy or pass</label>{isHost ? <select id="buy-timer" disabled={locked} value={room.buyWindowMs ?? 30000} onChange={e=>send('room:settings',{buyWindowMs:Number(e.target.value)})}>{BUY_TIMER_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select> : <p>{BUY_TIMER_OPTIONS.find(option=>option.value === room.buyWindowMs)?.label}</p>}<p className="form-note">Anyone can pause a timed choice while playing.</p>{isHost && <button className="text-button danger-link" disabled={locked} onClick={()=>window.confirm(`Close ${room.name}? This ends the table for everyone.`) && send('room:close',{code:room.code})}>Close table</button>}</details>
    {showRules && <RuleBook onClose={()=>setShowRules(false)} />}
    {showChat && <div className="v2-overlay" onClick={()=>setShowChat(false)}><div className="chat-dialog" role="dialog" aria-modal="true" aria-label="Table chat" onClick={e=>e.stopPropagation()}><ChatPanel chat={chat} act={send} disabled={locked} onClose={()=>setShowChat(false)} /></div></div>}
  </main>;
}

function invitationLink({code,inviteToken}) {
  const link = new URL('.', window.location.href);
  link.hash = `invite=${code}.${inviteToken}`;
  return link.href;
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
          <p><b className="text-amber-300">Sets die, straights live:</b> cards added to a set are stuck forever. Straights can keep growing at both ends — and if a joker sits in a straight, you can swap in the real card it stands for and reuse the joker (play it or discard that joker).</p>
          <p><b className="text-amber-300">Scoring the stragglers:</b> 2–9 face value · 10/J/Q/K = 10 · Ace = 15 · Joker = 50.</p>
        </div>
      </div>
    </div>
  );
}

/* ================= the table ================= */

function Table({ room, game, you, role, act: rawAct, onLeave, chat, health, externalBusy }) {
  const me = game.players.find((p) => p.id === you);
  const isPlayer = role === 'player' && !!me;
  const myTurn = isPlayer && game.currentPlayerId === you;
  const [actionBusy, setBusy] = useState(false);
  const busy = actionBusy || externalBusy;
  const actionPending = useRef(false);
  const locked = busy || (health && (!health.connected || !health.sessionReady || health.recovering || health.serverState === 'paused'));
  const canDraw = myTurn && game.phase === 'playing' && game.turnPhase === 'draw' && !game.pendingDraw && !game.buyWindow?.pendingDraw && !locked;
  const canAct = myTurn && game.phase === 'playing' && game.turnPhase === 'action' && !locked;
  const act = async (event, payload = {}) => {
    if (actionPending.current || locked) return {ok:false};
    actionPending.current = true; setBusy(true);
    try {
      if (['game:draw','game:buy','game:pass','game:cancelBuy','game:pauseBuy','game:resumeBuy'].includes(event)) payload = {...payload,decisionId:game.buyDecisionId};
      return await rawAct(event,payload);
    } finally { actionPending.current = false; setBusy(false); }
  };
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
  const [showMore, setShowMore] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [invite, setInvite] = useState(null);
  const [jokerChoice, setJokerChoice] = useState(null);
  const [sound, setSound] = useState(soundOn());
  const [autoPass, setAutoPass] = useState(localStorage.getItem('rummy.autopass') === '1');
  const [now, setNow] = useState(Date.now());
  const chatLen = useRef(chat.length);
  const wasMyTurn = useRef(false);
  const lastWindowKey = useRef(null);
  const lastPhase = useRef(game.phase);

  // Buy window countdown ticker
  const iRespondedBuy = game.buyRequests.includes(you) || game.buyPasses?.includes(you);
  const buyEligible = isPlayer && !myTurn && game.phase === 'playing' && game.turnPhase === 'draw' && !!game.discardTop && !game.buyDecisionClosed && (me?.buysUsed ?? 0) < (game.maxBuysPerRound ?? 3);
  useEffect(() => {
    if (!game.buyWindow) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [!!game.buyWindow]); // eslint-disable-line

  // Sounds + auto-pass on new buy windows + turn ding + title flash
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) dingTurn();
    wasMyTurn.current = myTurn;
    document.title = myTurn ? 'Your turn — Irish Rummy' : 'Irish Rummy';
  }, [myTurn]);
  useEffect(() => {
    // One key per window (a window is identified by the discard on offer).
    const key = game.buyDecisionId;
    if (key && key !== lastWindowKey.current && buyEligible && !iRespondedBuy && !locked) {
      lastWindowKey.current = key;
      if (autoPass) act('game:pass');
      else chimeBuy();
    }
  }, [game.buyWindow, game.discardTop?.id, buyEligible, iRespondedBuy, autoPass, locked]); // eslint-disable-line
  useEffect(() => {
    if (game.phase !== lastPhase.current) {
      if (game.phase === 'roundEnd') roundEndSound();
      if (game.phase === 'gameOver') fanfare();
      lastPhase.current = game.phase;
    }
  }, [game.phase]);

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

  const discardCard = async (cardId) => { if (!canAct || (game.mustPlayJoker && game.mustPlayJoker !== cardId)) return; const result = await act('game:discard', { cardId }); if (result && result.ok !== false) setSelected([]); };

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

  const layOffOn = async (meld, cardId, end = null) => {
    if (!canAct || !me?.hasGoneDown) return;
    const card = hand.find((c) => c.id === cardId);
    const choices = jokerEndChoices(meld, card);
    if (!end && choices.length > 1) {
      setJokerChoice({ meldId: meld.id, cardId, choices });
      return;
    }
    const result = await act('game:layOff', { meldId: meld.id, cardId, end: end || choices[0]?.end });
    if (result && result.ok !== false) { setJokerChoice(null); setSelected([]); }
  };

  const dropOnMeld = (meld) => {
    if (!canAct || !me?.hasGoneDown) return;
    const id = dragId || selected[0];
    if (id) layOffOn(meld, id);
  };

  const clickMeldCard = async (meld, card) => {
    if (!me?.hasGoneDown) return;
    if (canAct && card.joker && meld.type === 'straight' && selected.length === 1) {
      const result = await act('game:swapJoker', { meldId: meld.id, cardId: selected[0] });
      if (result && result.ok !== false) setSelected([]);
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
  const submitGoDown = async () => {
    const result = await act('game:goDown', { melds: staging.map((ids, i) => ({ type: slotTypes[i], cardIds: ids })) });
    if (result && result.ok !== false) { setStaging(null); setSelected([]); }
  };

  /* ---------- render ---------- */
  const setAutoPassPreference = (value) => { setAutoPass(value); localStorage.setItem('rummy.autopass', value ? '1' : '0'); };
  const openMenu = (setter) => { setShowMore(false); setter(true); };
  const makeInvite = async () => { const result = await act('room:invite'); if (result?.inviteToken) { const link = invitationLink(result); setInvite(link); try { await navigator.clipboard.writeText(link); } catch {} } setShowMore(false); };
  return <div className="table-v2">
    <header className="table-header"><button disabled={busy} onClick={onLeave}>‹ <span>My games</span></button><h1>{room.name}</h1><div className="menu-anchor"><button aria-label="Table menu" aria-expanded={showMore} onClick={()=>setShowMore(!showMore)}>•••{(unread > 0 || (isHost && room.joinRequests?.length > 0)) && <span className="unread-dot" />}</button>{showMore && <><button className="menu-dismiss" aria-label="Close table menu" onClick={()=>setShowMore(false)} /><nav className="table-menu" aria-label="Table options"><button onClick={()=>openMenu(setShowScores)}>Scores</button><button onClick={()=>openMenu(setShowRules)}>How to play</button><button onClick={()=>openMenu(setShowLog)}>History</button><button onClick={()=>{openMenu(setShowChat);setUnread(0);}}>Chat{unread > 0 ? ` · ${unread} new` : ''}</button>{isHost && room.visibility !== 'practice' && <button disabled={locked} onClick={makeInvite}>Copy invitation link</button>}{isHost && room.joinRequests?.length > 0 && <button onClick={()=>openMenu(setShowRequests)}>Join requests · {room.joinRequests.length}</button>}<button onClick={()=>setSound(toggleSound())}>Sound: {sound ? 'on' : 'off'}</button>{isPlayer && <button onClick={()=>setAutoPassPreference(!autoPass)}>Auto-pass: {autoPass ? 'on' : 'off'}</button>}{isHost && <button disabled={locked} className="danger-link" onClick={()=>window.confirm(`Close ${room.name}? This ends the table for everyone.`) && act('room:close',{code:room.code})}>Close table</button>}</nav></>}</div></header>
    <div className="opponents" aria-label="Players">{game.players.filter(p=>p.id !== you || !isPlayer).map(p=><div key={p.id} className={`opponent ${p.id === game.currentPlayerId ? 'opponent-current' : ''}`}><Avatar name={p.name} avatar={p.avatar} photoUrl={p.photoUrl} isBot={p.isBot} size={3.2} /><strong>{p.name}</strong><small>{p.handCount} cards{p.hasGoneDown ? ' · Down' : ''}{!p.connected && !p.isBot ? ' · Away' : ''}</small></div>)}</div>
    <div className="contract-line"><span>Round {game.round} of 7</span><strong>{contract?.label}</strong></div>
    <section className="felt-table" aria-label="Game table"><div className="draw-piles"><div><button className="pile-stack" disabled={!canDraw} aria-label="Draw from the deck" onClick={()=>act('game:draw',{from:'deck'})}><div className="card-back big"/><div className="card-back big"/><div className="card-back big"/></button><span>Deck</span></div><div onDragOver={e=>canAct && e.preventDefault()} onDrop={dropOnDiscard}>{game.discardTop ? <Card card={game.discardTop} big onClick={canDraw || (canAct && selected.length === 1 && (!game.mustPlayJoker || selected[0] === game.mustPlayJoker)) ? clickDiscardPile : undefined}/> : <div className="empty-discard"/>}<span>Discard</span></div></div>
      <div className="table-melds">{game.tableMelds.map(meld=><Meld key={meld.id} meld={meld} owner={game.players.find(p=>p.id === meld.ownerId)} active={canAct && me?.hasGoneDown} onDrop={()=>dropOnMeld(meld)} onCardClick={card=>clickMeldCard(meld,card)}/>)}</div>
    </section>
    <DecisionDock game={game} you={you} role={role} health={health} busy={busy} selected={selected} act={act} now={now} onStage={openStaging} onDiscard={()=>discardCard(selected[0])} autoPass={autoPass} onDisableAutoPass={()=>setAutoPassPreference(false)} staging={staging} />
      {/* go-down staging area */}
      {staging && myTurn && game.turnPhase === 'action' && !me.hasGoneDown && (
        <div className="staging-panel glass-panel">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <b>Going down — {contract.label}</b>
            <button disabled={busy} onClick={() => setStaging(null)} className="bg-emerald-900 hover:bg-emerald-800 rounded-lg px-3 py-1 text-sm">Cancel</button>
          </div>
          <div className="flex flex-wrap gap-3">
            {staging.map((ids, i) => (
              <div key={i} className="bg-emerald-950/70 rounded-xl p-2 min-w-[10.5rem]">
                <div className="text-xs mb-1 flex justify-between gap-3">
                  <span className="font-extrabold">{slotTypes[i] === 'set' ? 'SET of 3' : 'STRAIGHT of 4+'}</span>
                  <span>
                    <button disabled={busy || selected.length === 0} onClick={() => addSelectedToSlot(i)} className="text-amber-300 hover:text-amber-200 font-bold mr-2" title="Add selected cards (straights: select low → high)">Add selected</button>
                    <button disabled={busy} onClick={() => clearSlot(i)} className="text-red-300 hover:text-red-200">clear</button>
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
                  {ids.length === 0 && <span className="text-emerald-200/40 text-xs self-center px-2">select cards below, then “Add selected”</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="text-right mt-2">
            <button
              onClick={submitGoDown}
              disabled={!canAct || staging.some((s, i) => s.length < (slotTypes[i] === 'set' ? 3 : 4))}
              className="bg-amber-400 disabled:opacity-40 hover:bg-amber-300 text-black font-black rounded-xl px-7 py-2.5 shadow-lg"
            >
              <Icon name="down" /> Go down
            </button>
          </div>
        </div>
      )}


    {isPlayer && <section className="hand-v2" aria-label="Your hand" onDragOver={e=>e.preventDefault()} onDrop={()=>reorderTo('__end__')}><header><span><strong>Your hand</strong> · {hand.length} cards</span><div className="menu-anchor"><button className="text-button" aria-expanded={showSort} onClick={()=>setShowSort(!showSort)}>↕ Sort</button>{showSort && <><button className="menu-dismiss" aria-label="Close sort menu" onClick={()=>setShowSort(false)} /><div className="table-menu sort-menu"><button onClick={()=>{sortRuns();setShowSort(false);}}>By suit · Straights</button><button onClick={()=>{sortSets();setShowSort(false);}}>By rank · Sets</button></div></>}</div></header><div className="hand-scroll">{orderedHand.map(c=><div key={c.id} className="hand-slot" onDragOver={e=>{e.preventDefault();e.stopPropagation();}} onDrop={e=>{e.stopPropagation();reorderTo(c.id);}}><Card card={c} draggable={!busy} ghost={dragId === c.id} selected={selected.includes(c.id) || stagedIds.has(c.id)} onClick={()=>!busy && toggleSelect(c.id)} onDragStart={e=>{setDragId(c.id);e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>setDragId(null)}/></div>)}{hand.length === 0 && <p>No cards left.</p>}</div></section>}
    {showChat && <div className="v2-overlay" onClick={()=>setShowChat(false)}><div className="chat-dialog" role="dialog" aria-modal="true" aria-label="Table chat" onClick={e=>e.stopPropagation()}><ChatPanel chat={chat} act={act} disabled={locked} onClose={()=>setShowChat(false)} /></div></div>}
    {showRequests && <div className="v2-overlay" onClick={()=>setShowRequests(false)}><div className="glass-panel invite-dialog" role="dialog" aria-modal="true" aria-label="Join requests" onClick={e=>e.stopPropagation()}><JoinRequests requests={room.joinRequests} act={act} disabled={locked} /><button className="text-button" onClick={()=>setShowRequests(false)}>Done</button></div></div>}
    {invite && <div className="v2-overlay" onClick={()=>setInvite(null)}><div className="glass-panel invite-dialog" role="dialog" aria-modal="true" aria-label="Invite someone" onClick={e=>e.stopPropagation()}><h2>Invite someone</h2><p>Anyone with this link can join your private table.</p>{!room.started && <p className="form-note">Game code <strong>{room.code}</strong> · You approve code requests.</p>}<input aria-label="Invitation link" value={invite} readOnly onFocus={e=>e.target.select()}/><button className="primary-button" onClick={()=>setInvite(null)}>Done</button></div></div>}
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
  </div>;
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
              onClick={active ? () => onCardClick(c) : undefined}
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
        <p className="text-emerald-200/70 mb-4">Lowest score after seven rounds.</p>
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
          <Icon name="leave" /> My games
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
