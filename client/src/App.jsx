// Irish Rummy — a family table, with explicit saved-player recovery.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  socket, call, artUrl, listProfiles, getActiveProfile, createProfile, selectProfile,
  getHelloPayload, rememberRoom, clearCurrentRoom, forgetRoom,
  getConnectionStatus, subscribeConnectionStatus,
} from './socket.js';
import GameScreen, { RuleBook } from './GameScreen.jsx';

function readInitialPlayer() {
  try { return { profile: getActiveProfile(), profiles: listProfiles(), error: null }; }
  catch (error) { return { profile: null, profiles: [], error: error.message }; }
}

export default function App() {
  const [initial] = useState(readInitialPlayer);
  const [name, setName] = useState(initial.profile?.name || '');
  const [profiles, setProfiles] = useState(initial.profiles);
  const [signedIn, setSignedIn] = useState(false);
  const [roomState, setRoomState] = useState(null);
  const [roomsList, setRoomsList] = useState([]);
  const [chat, setChat] = useState([]);
  const [toast, setToast] = useState(initial.error);
  const [health, setHealth] = useState(getConnectionStatus);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef(null);
  const roomStateRef = useRef(null);
  const helloInFlight = useRef(false);

  const showError = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6500);
  }, []);
  const act = useCallback((event, payload) => call(event, payload).catch((e) => showError(e.message)), [showError]);
  const refreshRooms = useCallback(() => {
    call('rooms:list').then((r) => setRoomsList(r.rooms || [])).catch(() => {});
  }, []);

  const introduce = useCallback(async () => {
    if (helloInFlight.current) return;
    helloInFlight.current = true;
    try {
      const profile = getActiveProfile();
      if (!profile) return;
      setName(profile.name);
      const res = await call('hello', getHelloPayload());
      setSignedIn(true);
      if (!res.rejoined) {
        roomStateRef.current = null;
        setRoomState(null);
        setChat([]);
        if (profile.currentRoomCode) {
          clearCurrentRoom();
          showError('Your player is back. That table is no longer available; choose another below.');
        }
      }
      setProfiles(listProfiles());
    } catch (error) { showError(error.message); }
    finally { helloInFlight.current = false; }
  }, [showError]);

  useEffect(() => subscribeConnectionStatus(setHealth), []);
  useEffect(() => {
    const onState = (state) => {
      roomStateRef.current = state;
      setRoomState(state);
      try { rememberRoom(state); } catch (error) { showError(error.message); }
    };
    const onClosed = ({ code, name: roomName }) => {
      try { forgetRoom(code); } catch (error) { showError(error.message); }
      if (!roomStateRef.current || roomStateRef.current.room.code === code) {
        roomStateRef.current = null;
        setRoomState(null);
        setChat([]);
      }
      showError(`${roomName || code || 'That game'} was closed.`);
      refreshRooms();
    };
    const onChat = (message) => setChat((c) => [...c.slice(-100), message]);
    const onHistory = (messages) => setChat(messages);
    const onConnect = () => introduce();
    const onReady = ({ state: serverState }) => {
      if (serverState === 'ready' && !getConnectionStatus().sessionReady) introduce();
    };
    socket.on('room:state', onState);
    socket.on('room:closed', onClosed);
    socket.on('chat:message', onChat);
    socket.on('chat:history', onHistory);
    socket.on('connect', onConnect);
    socket.on('server:status', onReady);
    if (socket.connected) introduce();
    return () => {
      socket.off('room:state', onState);
      socket.off('room:closed', onClosed);
      socket.off('chat:message', onChat);
      socket.off('chat:history', onHistory);
      socket.off('connect', onConnect);
      socket.off('server:status', onReady);
      clearTimeout(toastTimer.current);
    };
  }, [introduce, showError, refreshRooms]);

  useEffect(() => {
    if (signedIn && health.sessionReady && !roomState) {
      refreshRooms();
      const timer = setInterval(refreshRooms, 4000);
      return () => clearInterval(timer);
    }
  }, [signedIn, health.sessionReady, roomState, refreshRooms]);

  const signIn = async (event) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      createProfile(name.trim());
      setProfiles(listProfiles());
      await introduce();
    } catch (error) { showError(error.message); }
    finally { setBusy(false); }
  };
  const recoverProfile = async (profile, roomCode) => {
    if (busy) return;
    setBusy(true);
    try {
      selectProfile(profile.token, roomCode ? { roomCode } : {});
      await introduce();
    } catch (error) { showError(error.message); }
    finally { setBusy(false); }
  };
  const leaveRoom = async () => {
    try {
      await call('rooms:leave');
      clearCurrentRoom();
      roomStateRef.current = null;
      setRoomState(null);
      setChat([]);
    } catch (error) { showError(error.message); }
  };
  const quickPlay = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await call('rooms:create', { roomName: `${name}'s quick game` });
      await call('room:addBot', { difficulty: 'easy' });
      await call('room:addBot', { difficulty: 'medium' });
      await call('room:addBot', { difficulty: 'hard' });
      await call('room:start');
    } catch (error) { showError(error.message); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    window.render_game_to_text = () => JSON.stringify({
      screen: !signedIn ? 'choose-player' : !roomState ? 'lobby' : roomState.room.started ? 'game' : 'waiting',
      connection: { connected: health.connected, ready: health.sessionReady, saving: health.serverState },
      playerName: name,
      room: roomState ? { name: roomState.room.name, code: roomState.room.code, role: roomState.role } : null,
      game: roomState?.game ? {
        phase: roomState.game.phase, round: roomState.game.round, contract: roomState.game.contract?.label,
        turnPhase: roomState.game.turnPhase,
        currentPlayer: roomState.game.players.find((player) => player.id === roomState.game.currentPlayerId)?.name,
        players: roomState.game.players.map((player) => ({ name: player.name, score: player.score, handCount: player.handCount, connected: player.connected, hasGoneDown: player.hasGoneDown })),
        yourHand: roomState.game.players.find((player) => player.id === roomState.you)?.hand?.map((card) => ({ rank: card.rank, suit: card.suit, joker: Boolean(card.joker) })),
        discard: roomState.game.discardTop ? { rank: roomState.game.discardTop.rank, suit: roomState.game.discardTop.suit, joker: Boolean(roomState.game.discardTop.joker) } : null,
        lastEvent: roomState.game.lastEvent,
      } : null,
    });
    return () => { delete window.render_game_to_text; };
  }, [signedIn, roomState, name, health]);
  const blocked = signedIn && (!health.connected || !health.sessionReady || health.serverState === 'paused');
  const statusMessage = !health.connected ? 'Reconnecting to the table… Your last saved game will return.'
    : health.recovering ? 'Finding your player and saved table…'
      : health.serverState === 'paused' ? health.message || 'Saving is unavailable. Play is paused while we reconnect.'
        : null;

  return (
    <div className="app-shell">
      {statusMessage && <div className="connection-banner" role="status">{statusMessage}</div>}
      {toast && <div className="toast" role="alert"><span>{toast}</span><button onClick={() => setToast(null)} aria-label="Dismiss message">×</button></div>}
      <div className={blocked ? 'sync-lock' : undefined} aria-busy={blocked || busy}>
        {!signedIn ? (
          <NameScreen name={name} setName={setName} onSubmit={signIn} profiles={profiles} onRecover={recoverProfile} busy={busy || health.recovering} connected={health.connected} storageError={initial.error} />
        ) : !roomState ? (
          <LobbyScreen name={name} rooms={roomsList} busy={busy}
            onCreate={(roomName) => act('rooms:create', { roomName })}
            onJoin={(code, spectate) => act('rooms:join', { code, spectate })}
            onCloseRoom={(code) => act('room:close', { code }).then(refreshRooms)}
            onRefresh={refreshRooms} onQuickPlay={quickPlay} />
        ) : <GameScreen state={roomState} chat={chat} act={act} onLeave={leaveRoom} />}
      </div>
    </div>
  );
}

export function Brand({ compact = false }) {
  return <span className={`brand ${compact ? 'brand-compact' : ''}`}>Irish Rummy<span className="brand-period">.</span></span>;
}

function WelcomeFrame({ children, signIn = false }) {
  const [showRules, setShowRules] = useState(false);
  return (
    <main className={`welcome-shell ${signIn ? 'sign-in-shell' : ''}`}>
      <header className="welcome-header"><Brand /><button className="text-button" onClick={() => setShowRules(true)}>How to play</button></header>
      <div className="welcome-grid">
        <div className="lake-illustration"><img src={artUrl('lake-house-v2.png')} alt="Two chairs waiting on a sunlit dock beside the family lake house" fetchPriority="high" /></div>
        <div className="welcome-content">{children}</div>
      </div>
      {showRules && <RuleBook onClose={() => setShowRules(false)} />}
    </main>
  );
}

function NameScreen({ name, setName, onSubmit, profiles, onRecover, busy, connected, storageError }) {
  return (
    <WelcomeFrame signIn>
      <div className="welcome-intro"><h1>Welcome to <br />the lake.</h1><p>Pull up a chair. Aunt Peggy's game is better together.</p></div>
      {profiles.length > 0 && <section className="saved-players" aria-label="Saved players">
        <h2>Pick up where you left off.</h2>
        {profiles.map((profile) => <div className="saved-player" key={profile.token}>
          <button className="profile-button" disabled={busy || !connected} onClick={() => onRecover(profile)}>
            <span className="profile-initial" aria-hidden="true">{(profile.name || '?').slice(0, 1)}</span>
            <span><strong>Continue as {profile.name || 'saved player'}</strong><small>{profile.currentRoomCode ? `Return to table ${profile.currentRoomCode}` : 'Your saved player'}</small></span><span className="profile-arrow" aria-hidden="true">↗</span>
          </button>
          {profile.rooms.length > 1 && <details className="saved-tables"><summary>Other saved tables</summary>{profile.rooms.filter((r) => r.code !== profile.currentRoomCode).map((r) => <button className="text-button" key={r.code} disabled={busy || !connected} onClick={() => onRecover(profile, r.code)}>{r.name} · {r.code}</button>)}</details>}
        </div>)}
      </section>}
      <form onSubmit={onSubmit} className="name-form">
        <label htmlFor="player-name">{profiles.length ? 'Or start as someone new' : 'Your name'}</label>
        <input id="player-name" placeholder="e.g. John" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" autoFocus={!profiles.length} disabled={busy || !!storageError} />
        <button className="primary-button" disabled={busy || !connected || !name.trim() || !!storageError}>{busy ? 'Finding your seat…' : 'Take a seat'}</button>
        <p className="form-note">Your player is remembered on this browser.</p>
      </form>
    </WelcomeFrame>
  );
}

function LobbyScreen({ name, rooms, onCreate, onJoin, onCloseRoom, onRefresh, onQuickPlay, busy }) {
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  return (
    <WelcomeFrame>
      <div className="welcome-intro"><h1>A seat for everyone.</h1><p>Welcome back, {name}. Gather the family or deal a practice hand.</p></div>
      <section className="lobby-section">
        <h2>Start a family game</h2>
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); onCreate(roomName); }}>
          <input aria-label="New game name" placeholder={`${name}'s game`} maxLength={30} value={roomName} onChange={(e) => setRoomName(e.target.value)} />
          <button className="primary-button" disabled={busy}>Create game</button>
        </form>
      </section>
      <section className="lobby-section">
        <h2>Have a room code?</h2>
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (joinCode.trim()) onJoin(joinCode, false); }}>
          <input aria-label="Room code" className="code-input" placeholder="ABCDE" maxLength={5} autoCapitalize="characters" autoComplete="off" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          <button className="primary-button" disabled={!joinCode.trim() || busy}>Join game</button>
        </form>
        <button className="text-button brass-link" disabled={!joinCode.trim() || busy} onClick={() => onJoin(joinCode, true)}>Watch instead</button>
      </section>
      <section className="lobby-section tables-section">
        <div className="section-heading"><h2>Your tables</h2><button onClick={onRefresh} className="text-button refresh-button" aria-label="Refresh games">Refresh</button></div>
        {rooms.length === 0 ? <p className="empty-tables">The table is ready. Start a game and invite the family.</p> : <ul className="room-list">{rooms.map((room) => <li key={room.code}>
          <div className="room-summary"><h3>{room.name}</h3><p>{room.started ? `Round ${room.round}` : 'Gathering players'} · {room.players.join(', ') || 'Open seats'}{room.spectators > 0 ? ` · ${room.spectators} watching` : ''}</p><span className="room-code-label">{room.code}</span></div>
          <div className="room-actions">
            {(!room.started || room.canRejoin) && <button onClick={() => onJoin(room.code, false)} className="outline-button">{room.started ? 'Rejoin' : 'Join'}</button>}
            <button onClick={() => onJoin(room.code, true)} className="text-button">Watch</button>
            {room.canClose && <button onClick={() => window.confirm(`Close ${room.name}? Everyone will be returned to the lobby.`) && onCloseRoom(room.code)} className="text-button danger-link">Close</button>}
          </div>
        </li>)}</ul>}
      </section>
      <button onClick={onQuickPlay} className="text-button brass-link practice-link" disabled={busy}>Practice with bots <span aria-hidden="true">↗</span></button>
    </WelcomeFrame>
  );
}
