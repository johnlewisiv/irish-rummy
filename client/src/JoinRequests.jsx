import React, { useRef, useState } from 'react';
import { Avatar } from './Card.jsx';

export default function JoinRequests({ requests = [], act, disabled = false }) {
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const decide = async (requestId, approve) => {
    if (disabled || pending.current) return;
    pending.current = true; setSaving(true);
    try { await act(approve ? 'room:approveJoin' : 'room:denyJoin', { requestId }); }
    finally { pending.current = false; setSaving(false); }
  };
  return <section className="join-requests" aria-label="Join requests">
    <h2>Waiting to join</h2>
    <p className="form-note">These players entered your game code. Let in the people you invited.</p>
    {requests.length === 0 ? <p>No one is waiting.</p> : <ul>{requests.map(request => <li key={request.requestId}>
      <Avatar name={request.displayName} avatar={request.avatarId} photoUrl={request.photoUrl} size={2.6} />
      <strong>{request.displayName}</strong>
      <div><button className="outline-button" disabled={disabled || saving} onClick={() => decide(request.requestId, false)}>Decline</button>
        <button className="primary-button" disabled={disabled || saving} onClick={() => decide(request.requestId, true)}>Let in</button></div>
    </li>)}</ul>}
  </section>;
}
