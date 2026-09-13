import React, { useEffect, useState } from 'react';
import { Avatar } from './Card.jsx';
import Icon from './Icon.jsx';
import { RuleBook } from './GameScreen.jsx';

const AVATARS = [
  ['lake-canoe', 'Canoe'], ['lake-dock', 'Dock'], ['lake-cabin', 'Cabin'],
  ['lake-lantern', 'Lantern'], ['lake-sailboat', 'Sailboat'], ['lake-coffee', 'Coffee'],
];

function AccountFrame({ children, profile, onProfile, signIn = false }) {
  const [rules, setRules] = useState(false);
  return <main className={`account-page ${signIn ? 'account-signin' : ''}`}>
    <div className="account-sheet">
      <header className="account-header">
        <span className="account-brand">Irish Rummy</span>
        {profile && <button type="button" className="account-profile-button" onClick={onProfile} aria-label="Open your profile">
          <Avatar name={profile.displayName} avatar={profile.avatarId} photoUrl={profile.useGooglePhoto ? profile.photoUrl : undefined} size={2.8} />
          <span>{profile.displayName}</span>
        </button>}
      </header>
      {children}
      <footer className="account-footer"><details><summary>About this game</summary>
        <p>A family tradition, learned from Aunt Peggy and carried on around the lake-house table.</p>
        <button className="account-link" onClick={() => setRules(true)}>How to play</button>
      </details></footer>
    </div>
    {rules && <RuleBook onClose={() => setRules(false)} />}
  </main>;
}

export function SignInScreen({ loading, enabled, error, busy, hasInvitation, onSignIn, onPractice, onRetry, onSignOut }) {
  return <AccountFrame signIn>
    <section className="account-welcome">
      <h1>Welcome to<br />the table.</h1>
      <p>Your people. Your games. A seat saved for you.</p>
      {hasInvitation && <p className="account-invitation-note">Your invitation is ready. Sign in to join the game.</p>}
      {loading ? <div className="account-auth-status" role="status"><p>Opening your account…</p>
        <button className="account-link" onClick={onRetry} disabled={busy}>Try again</button>
        {onSignOut && <button className="account-link" onClick={onSignOut}>Use another account</button>}
      </div> : <>
        <button className="account-google" onClick={onSignIn} disabled={busy || !enabled}>Continue with Google</button>
        {error && <p className="account-error" role="alert">{error} <button className="account-link" onClick={onRetry}>Try again</button></p>}
        {!enabled && !error && <p className="account-help">Google sign-in is being set up. You can still play a practice hand.</p>}
        <p className="account-help">Only games you create or join appear in your account.</p>
        <button className="account-link account-practice" onClick={onPractice} disabled={busy}>{busy ? 'Opening your table…' : 'Play a practice hand'}</button>
      </>}
    </section>
  </AccountFrame>;
}

function InvitationForm({ invitation, busy, onJoin, onDismiss, pendingCode, requestMessage }) {
  const [text, setText] = useState('');
  const isCode = /^[A-Z0-9]{5}$/i.test(text.trim());
  return <section className="account-invitation">
    <h2>Join a game</h2>
    {pendingCode && <p className="account-invitation-note" role="status">Request sent for {pendingCode}. Waiting for your host to let you in.</p>}
    {requestMessage && <p className="account-help" role="status">{requestMessage}</p>}
    {invitation && !text && <div className="account-invitation-note"><span>An invitation to game {invitation.code} is ready.</span>
      <button type="button" className="account-link" onClick={onDismiss} disabled={busy}>Dismiss</button></div>}
    <form className="account-inline-form" onSubmit={(event) => { event.preventDefault(); onJoin(text); }}>
      <input aria-label="Invitation link or game code" placeholder="Invitation link or game code" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={2048} value={text} onChange={(event) => setText(event.target.value)} disabled={busy} />
      <button className="account-primary" disabled={busy || (!text.trim() && !invitation)}>{isCode ? 'Request to join' : 'Join game'}</button>
    </form>
    {isCode && <p className="account-help">Your host approves code requests. An invitation link lets you join directly.</p>}
    {!isCode && (text.trim() || invitation) && <button className="account-link account-watch-invite" onClick={() => onJoin(text, true)} disabled={busy}>Watch this game instead</button>}
  </section>;
}

function MemberAvatars({ room }) {
  const members = room.members || (room.players || []).map((name) => ({ name }));
  return <div className="account-room-members">
    <div className="account-avatar-stack" aria-hidden="true">{members.slice(0, 6).map((member, index) => <Avatar key={index} name={member.name} avatar={member.avatarId || member.avatar} photoUrl={member.photoUrl} isBot={member.isBot} size={2.9} />)}</div>
    <p>{members.map((member) => member.name).join(', ')}</p>
  </div>;
}

function ProfileEditor({ profile, profiles, busy, onBack, onSave, onSignOut, onRecover }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [avatarId, setAvatarId] = useState(profile.avatarId || 'lake-canoe');
  const [useGooglePhoto, setUseGooglePhoto] = useState(Boolean(profile.useGooglePhoto));
  const savedPlayers = profiles.filter((p) => !p.claimedBy || p.claimedBy === profile.id);
  return <section className="account-editor">
    <button className="account-link account-back" onClick={onBack}>Back to My games</button>
    <h1>Your profile</h1><p className="account-subtitle">Your name and picture appear at your tables. Your account and game list stay private.</p>
    <form onSubmit={async (event) => { event.preventDefault(); const result = await onSave({ displayName: displayName.trim(), avatarId, useGooglePhoto }); if (result?.ok !== false) onBack(); }}>
      <label htmlFor="account-display-name">Name at the table</label>
      <input id="account-display-name" autoComplete="nickname" maxLength={20} value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={busy} required />
      <fieldset disabled={busy}><legend>Choose your picture</legend>
        <div className="account-avatar-options">{AVATARS.map(([id, label]) => <div className="account-avatar-option" key={id}>
          <Avatar name={displayName} avatar={id} size={4.1} selected={!useGooglePhoto && avatarId === id} onClick={() => { setAvatarId(id); setUseGooglePhoto(false); }} />
          <span>{label}</span>
        </div>)}</div>
        {profile.photoUrl && <label className="account-photo-option"><input type="checkbox" checked={useGooglePhoto} onChange={(event) => setUseGooglePhoto(event.target.checked)} />Use my Google photo
          {useGooglePhoto && <Avatar name={displayName} avatar={avatarId} photoUrl={profile.photoUrl} size={2.5} />}
        </label>}
      </fieldset>
      <button className="account-primary" disabled={busy || !displayName.trim()}>{busy ? 'Saving…' : 'Save profile'}</button>
    </form>
    {savedPlayers.length > 0 && <details className="account-recovery"><summary>Recover older games</summary>
      <p>Connect one of this browser’s saved players to your account. Choose only your own player; their original saved games will be kept.</p>
      <ul>{savedPlayers.map((legacy) => <li key={legacy.token}><div><strong>{legacy.name || 'Saved player'}</strong><p>{legacy.rooms?.length ? legacy.rooms.map((room) => room.name).join(', ') : 'Older player saved on this browser'}</p></div>
        <button className="account-outline" disabled={busy || Boolean(legacy.claimedBy)} onClick={() => onRecover(legacy)}>{legacy.claimedBy ? 'Connected' : 'Connect games'}</button>
      </li>)}</ul>
    </details>}
    <div className="account-signout"><button className="account-link" onClick={onSignOut}>Sign out</button><p>Your games stay saved in your account.</p></div>
  </section>;
}

export function AccountHome({ profile, rooms, roomsLoading, roomsError, busy, profiles, invitation,
  onSignOut, onProfileSave, onCreate, onOpen, onClose, onRefresh, onPractice, onJoinInvitation, onCheckJoinRequest, onDismissInvitation, onRecoverLegacy }) {
  const [page, setPage] = useState('games');
  const [roomName, setRoomName] = useState('');
  const [pendingCode, setPendingCode] = useState(null);
  const [requestMessage, setRequestMessage] = useState('');
  useEffect(() => {
    // Approval must not navigate away from an unsaved profile or new-game draft.
    if (!pendingCode || busy || page !== 'games') return;
    let active = true, checking = false;
    const check = async () => {
      if (!active || checking) return;
      checking = true;
      try {
        const result = await onCheckJoinRequest(pendingCode);
        if (!active || result?.ok === false) return;
        if (result?.member) {
          active = false; setPendingCode(null);
          onOpen({code:pendingCode, role:'player'});
        } else if (result?.pending === false) {
          active = false; setPendingCode(null);
          setRequestMessage('This request has ended. Ask your host for an invitation link or try another game.');
        }
      } finally { checking = false; }
    };
    check();
    const timer = setInterval(check, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [pendingCode, busy, page, onOpen, onCheckJoinRequest]);
  const join = async (text, spectate) => {
    setRequestMessage('');
    const result = await onJoinInvitation(text, spectate);
    if (result?.pending) setPendingCode(result.code);
    return result;
  };
  return <AccountFrame profile={profile} onProfile={() => setPage(page === 'profile' ? 'games' : 'profile')}>
    {page === 'profile' ? <ProfileEditor key={profile.id} profile={profile} profiles={profiles} busy={busy} onBack={() => setPage('games')} onSave={onProfileSave} onSignOut={onSignOut} onRecover={onRecoverLegacy} />
      : <>
        <div className="account-title-row"><div><h1>My games</h1><p className="account-subtitle">Your tables, ready when you are.</p></div>
          <button className="account-primary" onClick={() => setPage(page === 'new' ? 'games' : 'new')} disabled={busy}><Icon name="plus" />New game</button>
        </div>
        {page === 'new' && <form className="account-new-game" onSubmit={async (event) => { event.preventDefault(); const result = await onCreate(roomName.trim()); if (result?.ok !== false) { setPage('games'); setRoomName(''); } }}>
          <label htmlFor="new-game-name">Give your game a name</label><div className="account-inline-form">
            <input id="new-game-name" placeholder={`${profile.displayName}'s game`} maxLength={30} value={roomName} onChange={(event) => setRoomName(event.target.value)} disabled={busy} autoFocus />
            <button className="account-primary" disabled={busy}>Create game</button>
          </div><p className="account-help">This game is private. Share an invitation after you create it.</p>
          <button type="button" className="account-link" onClick={() => setPage('games')}>Cancel</button>
        </form>}
        <section className="account-games" aria-label="Your saved games" aria-busy={roomsLoading}>
          {roomsError ? <p className="account-error" role="status">{roomsError} <button className="account-link" onClick={onRefresh}>Try again</button></p>
            : roomsLoading && rooms.length === 0 ? <p className="account-empty" role="status">Finding your games…</p>
              : rooms.length === 0 ? <div className="account-empty"><h2>Your first table starts here.</h2><p>Create a game or open an invitation from someone you know.</p></div> : null}
          <ul>{rooms.map((room) => <li className="account-game-row" key={room.code}>
            <div className="account-room-name"><h2>{room.name}</h2><p>{room.yourTurn ? 'Your turn · ' : ''}{room.started ? `Round ${room.round || 1} of 7` : 'Waiting for players'}{room.role === 'spectator' ? ' · Watching' : ''}</p></div>
            <MemberAvatars room={room} />
            <div className="account-room-actions"><button className="account-outline" onClick={() => onOpen(room)} disabled={busy}>{room.role === 'spectator' ? 'Watch' : room.started ? 'Resume' : 'Open'}</button>
              {room.canClose && <details className="account-room-menu"><summary aria-label={`More options for ${room.name}`}>More</summary><button className="account-link" disabled={busy} onClick={() => { if (window.confirm(`Close ${room.name}? This ends the saved game for everyone.`)) onClose(room); }}>Close game</button></details>}
            </div>
          </li>)}</ul>
        </section>
        <InvitationForm invitation={invitation} busy={busy} onJoin={join} onDismiss={onDismissInvitation} pendingCode={pendingCode} requestMessage={requestMessage} />
        <button className="account-link account-practice" onClick={onPractice} disabled={busy}>Practice with bots</button>
        {profiles.some((p) => !p.claimedBy) && <button className="account-link account-recovery-shortcut" onClick={() => setPage('profile')}>Recover older games</button>}
      </>}
  </AccountFrame>;
}
