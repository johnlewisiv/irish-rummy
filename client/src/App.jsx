import React, { useCallback, useEffect, useRef, useState } from 'react';
import { socket, call, basePath, resetConnection, listProfiles, getActiveProfile, createProfile,
  getHelloPayload, rememberRoom, clearCurrentRoom, forgetRoom, markProfileClaimed,
  getConnectionStatus, subscribeConnectionStatus } from './socket.js';
import { getAuth } from './auth.js';
import { accountSession, parseInvitation } from './account-session.js';
import { captureInvitation, roomForIntroduction } from './invitation-navigation.js';
import { createPracticeGame } from './practice.js';
import GameScreen from './GameScreen.jsx';
import { AccountHome, SignInScreen } from './AccountScreens.jsx';
import Icon from './Icon.jsx';
import './accounts-v2.css';

const auth = getAuth(basePath);
const appUrl = () => new URL(`${basePath}/`, window.location.origin).href;
function initialNavigation() {
  let profiles = [], guest = null, invitation = null, error = null;
  try {
    profiles = listProfiles().filter((p) => !p.practiceOnly);
    const active = getActiveProfile();
    if (active?.practiceOnly && active.currentRoomCode) guest = active;
  } catch (failure) { error = failure.message; }
  try {
    invitation = captureInvitation({ href: window.location.href, baseUrl: appUrl(), store: accountSession(),
      replaceUrl: (url) => window.history.replaceState(null, '', url) }) || accountSession().getInvitation();
  } catch (failure) { error = failure.message; }
  return { profiles, guest, invitation, error };
}

export default function App() {
  const [initial] = useState(initialNavigation);
  const [authState, setAuthState] = useState(auth.getState);
  const [guest, setGuest] = useState(initial.guest);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState(initial.profiles);
  const [roomState, setRoomState] = useState(null);
  const [roomIdentity, setRoomIdentity] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState(null);
  const [chat, setChat] = useState([]);
  const [invitation, setInvitation] = useState(initial.invitation);
  const invitationRef = useRef(initial.invitation);
  const [invitationNavigation, setInvitationNavigation] = useState(0);
  const [toast, setToast] = useState(initial.error);
  const [health, setHealth] = useState(getConnectionStatus);
  const [busy, setBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState(null);
  const roomRef = useRef(null), identityRef = useRef(null), epoch = useRef(0), helloRef = useRef(null);
  const toastTimer = useRef(null), practiceRequested = useRef(false), actionSequence = useRef(0), navigation = useRef(0);
  const identityKey = authState.user?.id ? `account:${authState.user.id}` : guest ? `guest:${guest.token}` : null;
  const showMessage = useCallback((message) => {
    setToast(message); clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  }, []);
  const clearTable = useCallback(() => {
    roomRef.current = null; setRoomState(null); setRoomIdentity(null); setChat([]); setActionStatus(null);
  }, []);
  const refreshRooms = useCallback(async () => {
    if (!identityRef.current?.accountId) return;
    const stamp = epoch.current; setRoomsLoading(true);
    try {
      const result = await call('rooms:list');
      if (stamp === epoch.current) { setRooms(result.rooms || []); setRoomsError(null); }
    } catch (error) { if (stamp === epoch.current) setRoomsError(error.message); }
    finally { if (stamp === epoch.current) setRoomsLoading(false); }
  }, []);
  const introduce = useCallback(async () => {
    const current = identityRef.current;
    if (!current || !socket.connected || helloRef.current) return;
    const request = {}; helloRef.current = request;
    const stamp = epoch.current;
    try {
      let payload;
      if (current.accountId) {
        const accessToken = await auth.getAccessToken();
        if (stamp !== epoch.current) return;
        if (!accessToken) throw new Error('Sign in again to reopen your games.');
        let code = null;
        try { code = roomForIntroduction({ accountId: current.accountId, invitation: invitationRef.current, store: accountSession() }); }
        catch (error) { showMessage(error.message); }
        payload = { accessToken, ...(code ? { roomCode: code } : { rejoin: false }) };
      } else payload = { ...getHelloPayload(), ...(invitationRef.current ? { rejoin: false } : {}) };
      const result = await call('hello', payload);
      if (stamp !== epoch.current) return;
      setProfile(result.profile || null);
      if (!result.rejoined) {
        clearTable();
        if (current.accountId && result.roomUnavailable) {
          accountSession().rememberRoom(current.accountId, null);
          showMessage('That game is no longer available. Your other games are below.');
        }
      } else setActionStatus({ state: 'saved', message: 'Your saved game is up to date.' });
    } catch (error) { if (stamp === epoch.current) showMessage(error.message); }
    finally { if (helloRef.current === request) helloRef.current = null; }
  }, [clearTable, showMessage]);

  useEffect(() => { const off = auth.subscribe(setAuthState); auth.initialize(); return off; }, []);
  useEffect(() => subscribeConnectionStatus(setHealth), []);
  useEffect(() => {
    const receiveInvitation = () => {
      try {
        const pending = captureInvitation({ href: window.location.href, baseUrl: appUrl(), store: accountSession(),
          replaceUrl: (url) => window.history.replaceState(null, '', url) });
        if (!pending) return;
        invitationRef.current = pending; setInvitation(pending);
        setInvitationNavigation((value) => value + 1);
        // A same-document link is explicit navigation. Stop older setup/hello
        // continuations, then reconnect without reopening the previous table.
        navigation.current += 1; epoch.current += 1; helloRef.current = null;
        practiceRequested.current = false; setBusy(false); resetConnection(); clearTable();
        if (identityRef.current) socket.connect();
      } catch (error) { showMessage(error.message); }
    };
    window.addEventListener('hashchange', receiveInvitation);
    return () => window.removeEventListener('hashchange', receiveInvitation);
  }, [clearTable, showMessage]);
  useEffect(() => {
    const onState = (state) => {
      const current = identityRef.current; if (!current) return;
      if (roomRef.current && roomRef.current.room.code !== state.room.code) setChat([]);
      roomRef.current = state; setRoomState(state); setRoomIdentity(current.key);
      try {
        if (current.accountId) accountSession().rememberRoom(current.accountId, state.room.code);
        else rememberRoom(state);
      } catch (error) { showMessage(error.message); }
    };
    const onClosed = ({ code, name }) => {
      const current = identityRef.current;
      try {
        forgetRoom(code);
        if (current?.accountId && accountSession().getRoom(current.accountId) === code) accountSession().rememberRoom(current.accountId, null);
      } catch (error) { showMessage(error.message); }
      if (roomRef.current?.room.code === code) clearTable();
      showMessage(`${name || 'That game'} was closed.`); refreshRooms();
    };
    const onChat = (message) => { if (identityRef.current) setChat((items) => [...items.slice(-100), message]); };
    const onHistory = (items) => { if (identityRef.current) setChat(items); };
    const onReady = ({ state }) => { if (state === 'ready' && !getConnectionStatus().sessionReady) introduce(); };
    socket.on('room:state', onState); socket.on('room:closed', onClosed);
    socket.on('chat:message', onChat); socket.on('chat:history', onHistory);
    socket.on('connect', introduce); socket.on('server:status', onReady);
    return () => {
      socket.off('room:state', onState); socket.off('room:closed', onClosed);
      socket.off('chat:message', onChat); socket.off('chat:history', onHistory);
      socket.off('connect', introduce); socket.off('server:status', onReady); clearTimeout(toastTimer.current);
    };
  }, [clearTable, introduce, refreshRooms, showMessage]);
  useEffect(() => {
    // An account change invalidates old receipts before another connection opens.
    epoch.current += 1; helloRef.current = null; resetConnection(); clearTable();
    setProfile(null); setRooms([]); setRoomsError(null); setRoomsLoading(false); setBusy(practiceRequested.current);
    identityRef.current = authState.user?.id ? { key: identityKey, accountId: authState.user.id }
      : guest ? { key: identityKey, guestToken: guest.token } : null;
    if (identityRef.current && !authState.loading) socket.connect();
  }, [identityKey, authState.loading, clearTable]);
  useEffect(() => { if (identityRef.current?.accountId && socket.connected) introduce(); }, [authState.sessionVersion, introduce]);
  useEffect(() => {
    if (!profile || !health.sessionReady || roomState) return;
    refreshRooms();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refreshRooms(); }, 10000);
    return () => clearInterval(timer);
  }, [profile?.id, health.sessionReady, roomState, refreshRooms]);

  const act = useCallback(async (event, payload) => {
    const stamp = epoch.current, sequence = ++actionSequence.current;
    const readOnly = ['rooms:list', 'profile:get', 'rooms:joinRequestStatus'].includes(event);
    if (!readOnly) setActionStatus({ state: 'saving', message: 'Saving your choice…' });
    try {
      const result = await call(event, payload);
      if (stamp !== epoch.current) return { ok: false, error: 'Your account changed.' };
      if (!readOnly && sequence === actionSequence.current) setActionStatus({ state: 'saved', message: 'Choice saved.' });
      return result;
    } catch (error) {
      if (stamp === epoch.current) {
        if (!readOnly && sequence === actionSequence.current) setActionStatus({ state: error.uncertain ? 'checking' : 'error', message: error.uncertain ? 'Reconnecting—checking your saved choice.' : error.message });
        showMessage(error.message);
        if (['AUTH_EXPIRED', 'AUTH_REQUIRED'].includes(error.code) && identityRef.current?.accountId) {
          auth.refresh().then(() => { if (stamp === epoch.current) socket.disconnect().connect(); }).catch(() => showMessage('Please sign in again to continue. Your game is saved.'));
        }
      }
      return { ok: false, error: error.message, uncertain: Boolean(error.uncertain), retryable: Boolean(error.retryable) };
    }
  }, [showMessage]);
  const leaveRoom = async () => {
    navigation.current += 1; practiceRequested.current = false;
    const result = await act('rooms:leave'); if (result.ok === false) return;
    try {
      if (identityRef.current?.accountId) accountSession().rememberRoom(identityRef.current.accountId, null);
      else clearCurrentRoom();
    } catch (error) { showMessage(error.message); }
    clearTable(); if (!authState.user) setGuest(null);
  };
  const signIn = async () => {
    setBusy(true);
    try { await auth.signIn(appUrl()); }
    catch (error) { showMessage(error.message); setBusy(false); }
  };
  const signOut = async () => {
    epoch.current += 1; identityRef.current = null; resetConnection(); clearTable();
    setProfile(null); setRooms([]); setGuest(null); setBusy(false); practiceRequested.current = false;
    try { await auth.signOut(); } catch (error) { showMessage(error.message); }
  };
  const startPractice = () => {
    if (busy) return; setBusy(true); practiceRequested.current = true;
    if (!authState.user && !guest) {
      try { setGuest(createProfile('Practice player', { practiceOnly: true })); }
      catch (error) { practiceRequested.current = false; setBusy(false); showMessage(error.message); }
    }
  };
  useEffect(() => {
    if (!busy || !practiceRequested.current || !health.sessionReady) return;
    practiceRequested.current = false; const stamp = epoch.current, place = navigation.current;
    (async () => {
      try {
        await createPracticeGame({ call, isCurrent: (code) => stamp === epoch.current
          && place === navigation.current && (!code || roomRef.current?.room.code === code) });
      } catch (error) { if (stamp === epoch.current) showMessage(error.message); }
      finally { if (stamp === epoch.current) setBusy(false); }
    })();
  }, [busy, health.sessionReady, showMessage]);
  const runBusy = async (operation) => {
    if (busy) return { ok: false }; const stamp = epoch.current; setBusy(true);
    try { return await operation(); } finally { if (stamp === epoch.current) setBusy(false); }
  };
  const joinInvitation = async (text, spectate = false) => {
    try {
      const code = String(text || '').trim().toUpperCase();
      if (/^[A-Z0-9]{5}$/.test(code)) {
        if (!profile) throw new Error('Sign in before entering a game code.');
        if (spectate) throw new Error('Ask your host for an invitation link to watch.');
        return await runBusy(async () => {
          const result = await act('rooms:requestJoin', { code });
          return result.member ? act('rooms:join', { code }) : result;
        });
      }
      const pending = text ? parseInvitation(text, appUrl()) : invitation;
      if (!pending) throw new Error('Paste an invitation link first.');
      accountSession().saveInvitation(pending); invitationRef.current = pending; setInvitation(pending);
      if (!profile) { await signIn(); return { ok: false }; }
      return await runBusy(async () => {
        const result = await act('rooms:join', { ...pending, spectate });
        if (result.ok !== false) { accountSession().clearInvitation(); invitationRef.current = null; setInvitation(null); }
        return result;
      });
    } catch (error) { showMessage(error.message); return { ok: false, error: error.message }; }
  };
  const dismissInvitation = () => {
    try { accountSession().clearInvitation(); invitationRef.current = null; setInvitation(null); } catch (error) { showMessage(error.message); }
  };
  const saveProfile = (changes) => runBusy(async () => {
    const result = await act('profile:update', changes);
    if (result.ok !== false) setProfile(result.profile); return result;
  });
  const recoverLegacy = (legacy) => runBusy(async () => {
    const result = await act('profile:claimLegacy', { token: legacy.token });
    if (result.ok !== false) {
      setProfile(result.profile);
      if (result.claimed > 0) {
        try { markProfileClaimed(legacy.token, result.profile.id); setProfiles(listProfiles().filter((p) => !p.practiceOnly)); }
        catch (error) { showMessage(error.message); }
      }
      await refreshRooms();
      showMessage(result.claimed ? `${result.claimed} saved ${result.claimed === 1 ? 'game is' : 'games are'} now connected to your account.` : 'No older games were found for that saved player.');
    }
    return result;
  });
  const visibleProfile = profile?.id === authState.user?.id ? profile : null;
  const visibleRoom = identityKey && roomIdentity === identityKey ? roomState : null;
  useEffect(() => {
    window.render_game_to_text = () => JSON.stringify({
      screen: visibleRoom ? visibleRoom.room.started ? 'game' : 'waiting' : visibleProfile ? 'my-games' : 'sign-in',
      connection: { connected: health.connected, ready: health.sessionReady, saving: health.serverState },
      playerName: visibleProfile?.displayName || guest?.name || null,
      room: visibleRoom ? { name: visibleRoom.room.name, code: visibleRoom.room.code, role: visibleRoom.role } : null,
      game: visibleRoom?.game ? {
        phase: visibleRoom.game.phase, round: visibleRoom.game.round, contract: visibleRoom.game.contract?.label,
        turnPhase: visibleRoom.game.turnPhase,
        currentPlayer: visibleRoom.game.players.find((p) => p.id === visibleRoom.game.currentPlayerId)?.name,
        players: visibleRoom.game.players.map((p) => ({ name: p.name, score: p.score, handCount: p.handCount, connected: p.connected, hasGoneDown: p.hasGoneDown })),
        yourHand: visibleRoom.game.players.find((p) => p.id === visibleRoom.you)?.hand?.map((c) => ({ rank: c.rank, suit: c.suit, joker: Boolean(c.joker) })),
        discard: visibleRoom.game.discardTop ? { rank: visibleRoom.game.discardTop.rank, suit: visibleRoom.game.discardTop.suit, joker: Boolean(visibleRoom.game.discardTop.joker) } : null,
        lastEvent: visibleRoom.game.lastEvent,
      } : null,
    });
    return () => { delete window.render_game_to_text; };
  }, [visibleProfile, guest, visibleRoom, health]);
  const blocked = Boolean(identityKey) && (!health.connected || !health.sessionReady || health.serverState === 'paused');
  const statusMessage = !identityKey ? null : !health.connected ? 'Reconnecting. Your last saved game will return.'
    : health.recovering ? 'Opening your saved games…' : health.serverState === 'paused' ? health.message || 'Saving is unavailable. Play is paused while we reconnect.' : null;
  return <div className="app-shell">
    {statusMessage && <div className="connection-banner" role="status">{statusMessage}</div>}
    {toast && <div className="toast" role="alert"><span>{toast}</span><button onClick={() => setToast(null)} aria-label="Dismiss message"><Icon name="close" /></button></div>}
    {visibleRoom ? <GameScreen key={`${identityKey}:${visibleRoom.room.code}`} state={visibleRoom} chat={chat} act={act} onLeave={leaveRoom} health={health} actionStatus={actionStatus} busy={busy} />
      : visibleProfile ? <AccountHome key={`${identityKey}:${invitationNavigation}`} profile={visibleProfile} rooms={rooms} roomsLoading={roomsLoading} roomsError={roomsError}
        busy={busy || blocked} profiles={profiles} invitation={invitation} onSignOut={signOut} onProfileSave={saveProfile}
        onCreate={(roomName) => runBusy(() => act('rooms:create', { roomName }))}
        onOpen={(room) => runBusy(() => act('rooms:join', { code: room.code, spectate: room.role === 'spectator' }))}
        onClose={(room) => runBusy(async () => { const result = await act('room:close', { code: room.code }); if (result.ok !== false) await refreshRooms(); return result; })}
        onRefresh={refreshRooms} onPractice={startPractice} onJoinInvitation={joinInvitation} onCheckJoinRequest={code => act('rooms:joinRequestStatus', { code })} onDismissInvitation={dismissInvitation} onRecoverLegacy={recoverLegacy} />
        : <SignInScreen loading={authState.loading || Boolean(authState.user)} enabled={authState.enabled} error={authState.error}
          busy={busy} hasInvitation={Boolean(invitation)} onSignIn={signIn} onPractice={startPractice}
          onSignOut={authState.user ? signOut : null} onRetry={() => authState.user ? introduce() : window.location.reload()} />}
  </div>;
}
export function Brand() { return <span className="account-brand">Irish Rummy</span>; }
