// App.jsx — top-level screens: sign-in → lobby → room (waiting or in-game).
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { socket, call, getToken, getSavedName, saveName, artUrl } from './socket.js';
import GameScreen from './GameScreen.jsx';

export default function App() {
  const [name, setName] = useState(getSavedName());
  const [signedIn, setSignedIn] = useState(false);
  const [roomState, setRoomState] = useState(null); // {room, game, you, role}
  const [roomsList, setRoomsList] = useState([]);
  const [chat, setChat] = useState([]);
  const [toast, setToast] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const toastTimer = useRef(null);
  const roomStateRef = useRef(null);

  const showError = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  /** Wrapper: run a server call, toast any player-facing error. */
  const act = useCallback((event, payload) =>
    call(event, payload).catch((e) => showError(e.message)), [showError]);

  const refreshRooms = useCallback(() => {
    call('rooms:list').then((r) => setRoomsList(r.rooms || [])).catch(() => {});
  }, []);

  useEffect(() => { roomStateRef.current = roomState; }, [roomState]);

  useEffect(() => {
    const onState = (s) => setRoomState(s);
    const onClosed = ({ code, name }) => {
      setRoomState(null);
      setChat([]);
      showError(`${name || code || 'That game'} was closed.`);
      refreshRooms();
    };
    const onChat = (m) => setChat((c) => [...c.slice(-100), m]);
    const onHistory = (msgs) => setChat(msgs);
    const onConnect = () => {
      setConnected(true);
      // (Re)introduce ourselves — the server reseats us if we were mid-game.
      if (getSavedName()) {
        call('hello', { token: getToken(), name: getSavedName() })
          .then((res) => {
            setSignedIn(true);
            if (roomStateRef.current && !res.rejoined) {
              setRoomState(null);
              setChat([]);
              showError('That game is no longer on the server. Start a fresh room.');
              refreshRooms();
            }
          })
          .catch(() => {});
      }
    };
    const onDisconnect = () => setConnected(false);
    socket.on('room:state', onState);
    socket.on('room:closed', onClosed);
    socket.on('chat:message', onChat);
    socket.on('chat:history', onHistory);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) onConnect();
    return () => {
      socket.off('room:state', onState);
      socket.off('room:closed', onClosed);
      socket.off('chat:message', onChat);
      socket.off('chat:history', onHistory);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [showError, refreshRooms]);

  useEffect(() => {
    if (signedIn && !roomState) {
      refreshRooms();
      const t = setInterval(refreshRooms, 4000);
      return () => clearInterval(t);
    }
  }, [signedIn, roomState, refreshRooms]);

  const signIn = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    saveName(n);
    try {
      await call('hello', { token: getToken(), name: n });
      setSignedIn(true);
    } catch (err) { showError(err.message); }
  };

  const leaveRoom = async () => {
    await act('rooms:leave');
    setRoomState(null);
    setChat([]);
  };

  /** One click: room + three bots + deal. */
  const quickPlay = async () => {
    try {
      await call('rooms:create', { roomName: `${name}'s quick game` });
      await call('room:addBot', { difficulty: 'easy' });
      await call('room:addBot', { difficulty: 'medium' });
      await call('room:addBot', { difficulty: 'hard' });
      await call('room:start');
    } catch (e) { showError(e.message); }
  };

  return (
    <div className="min-h-screen text-emerald-50">
      {!connected && (
        <div className="fixed top-0 inset-x-0 bg-red-700 text-white text-center text-sm py-1 z-50">
          Connection lost — reconnecting…
        </div>
      )}
      {toast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-amber-500 text-black font-semibold px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}

      {!signedIn ? (
        <NameScreen name={name} setName={setName} onSubmit={signIn} />
      ) : !roomState ? (
        <LobbyScreen
          name={name}
          rooms={roomsList}
          onCreate={(roomName) => act('rooms:create', { roomName })}
          onJoin={(code, spectate) => act('rooms:join', { code, spectate })}
          onCloseRoom={(code) => act('room:close', { code }).then(refreshRooms)}
          onRefresh={refreshRooms}
          onQuickPlay={quickPlay}
        />
      ) : (
        <GameScreen state={roomState} chat={chat} act={act} onLeave={leaveRoom} />
      )}
    </div>
  );
}

/** Carved-sign logo with a plain-text fallback if the art is missing. */
function Logo({ className }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <h1 className={`text-5xl font-black tracking-tight drop-shadow-md ${className}`}>☘️ Irish Rummy</h1>;
  return <img src={artUrl('logo.png')} alt="Irish Rummy" draggable={false} onError={() => setBroken(true)} className={className} />;
}

/* ---------------- sign-in ---------------- */
function NameScreen({ name, setName, onSubmit }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
      <div className="text-center">
        <Logo className="w-[26rem] max-w-[88vw] mx-auto drop-shadow-2xl" />
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-3 w-full max-w-xs">
        <input
          className="rounded-lg px-4 py-3 text-black bg-emerald-50 text-center text-lg font-semibold outline-none focus:ring-4 ring-amber-400"
          placeholder="Your name"
          maxLength={20}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <button className="bg-amber-400 hover:bg-amber-300 text-black font-bold rounded-lg py-3 text-lg shadow-lg">
          Play
        </button>
      </form>
    </div>
  );
}

/* ---------------- lobby ---------------- */
function LobbyScreen({ name, rooms, onCreate, onJoin, onCloseRoom, onRefresh, onQuickPlay }) {
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8">
      <header className="text-center">
        <Logo className="w-64 max-w-[70vw] mx-auto drop-shadow-xl" />
        <p className="text-emerald-200/80 mt-2">Welcome, {name}.</p>
      </header>

      <button
        onClick={onQuickPlay}
        className="bg-amber-400 hover:bg-amber-300 text-black font-black rounded-2xl px-6 py-4 text-lg shadow-xl hover:scale-[1.02] transition-transform"
      >
        🎮 Quick play vs bots
        <span className="block text-xs font-semibold text-black/60">instantly deals you in against Pippin, Tom Bombadil and Saruman</span>
      </button>

      <section className="felt-panel rounded-2xl p-5 flex flex-col gap-3">
        <h2 className="font-bold text-lg">Start a game with friends</h2>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg px-3 py-2 text-black bg-emerald-50 outline-none"
            placeholder={`${name}'s game`}
            maxLength={30}
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
          <button
            onClick={() => onCreate(roomName)}
            className="bg-amber-400 hover:bg-amber-300 text-black font-bold rounded-lg px-5"
          >
            Create
          </button>
        </div>
        <p className="text-sm text-emerald-200/70">
          Play solo by adding bots, or share the room code with friends and family.
        </p>
      </section>

      <section className="felt-panel rounded-2xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Join a game</h2>
          <button onClick={onRefresh} className="text-sm text-amber-300 hover:text-amber-200">↻ refresh</button>
        </div>
        <div className="flex gap-2">
          <input
            className="w-36 rounded-lg px-3 py-2 text-black bg-emerald-50 outline-none uppercase tracking-widest"
            placeholder="CODE"
            maxLength={5}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <button onClick={() => joinCode && onJoin(joinCode, false)} className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg px-4">Join</button>
          <button onClick={() => joinCode && onJoin(joinCode, true)} className="bg-emerald-800 hover:bg-emerald-700 rounded-lg px-4">Spectate</button>
        </div>
        {rooms.length === 0 ? (
          <p className="text-sm text-emerald-200/60">No open games right now.</p>
        ) : (
          <ul className="divide-y divide-emerald-900/60">
            {rooms.map((r) => (
              <li key={r.code} className="py-2 flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{r.name}</span>{' '}
                  <span className="text-xs bg-emerald-900/70 rounded px-1.5 py-0.5 tracking-widest">{r.code}</span>
                  <div className="text-xs text-emerald-200/70">
                    {r.players.join(', ')} {r.started ? `— round ${r.round}` : '— waiting'}
                    {r.spectators > 0 && ` — ${r.spectators} watching`}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {(!r.started || r.canRejoin) && (
                    <button onClick={() => onJoin(r.code, false)} className="bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold rounded px-3 py-1">
                      {r.started ? 'Rejoin' : 'Join'}
                    </button>
                  )}
                  <button onClick={() => onJoin(r.code, true)} className="bg-emerald-800 hover:bg-emerald-700 text-sm rounded px-3 py-1">Watch</button>
                  {r.canClose && (
                    <button
                      onClick={() => window.confirm(`Close ${r.name}? Everyone will be returned to the lobby.`) && onCloseRoom(r.code)}
                      className="bg-red-700 hover:bg-red-600 text-sm rounded px-3 py-1"
                    >
                      Close
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
