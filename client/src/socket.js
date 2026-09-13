// One connection. Player profiles persist across tab/browser closure; each tab
// selects its player explicitly, using the helpers in session.js.
import { io } from 'socket.io-client';
export {
  getToken, getSavedName, saveName, listProfiles, getActiveProfile, selectProfile,
  createProfile, getHelloPayload, rememberRoom, clearCurrentRoom, forgetRoom,
} from './session.js';

// Works whether the app is served at / or at /rummy/ behind a proxy.
const basePath = new URL('.', window.location.href).pathname.replace(/\/$/, '');
export const socket = io({ path: `${basePath}/socket.io` });

let helloAttempt = 0;
let status = {
  connected: socket.connected,
  sessionReady: false,
  recovering: false,
  persistence: 'unknown',
  serverState: 'unknown',
  message: null,
};
const statusListeners = new Set();

function setStatus(changes) {
  status = { ...status, ...changes };
  for (const listener of statusListeners) listener({ ...status });
}

/** Connection health for a truthful recovery/save banner. */
export const getConnectionStatus = () => ({ ...status });
export function subscribeConnectionStatus(listener) {
  statusListeners.add(listener);
  listener(getConnectionStatus());
  return () => statusListeners.delete(listener);
}

socket.on('connect', () => {
  helloAttempt += 1;
  setStatus({ connected: true, sessionReady: false, recovering: false, serverState: 'unknown', message: null });
});
socket.on('disconnect', () => {
  helloAttempt += 1;
  setStatus({ connected: false, sessionReady: false, recovering: false, message: 'Connection lost. Reconnecting to your saved game…' });
});
socket.on('connect_error', () => {
  setStatus({ connected: false, sessionReady: false, recovering: false, message: 'Cannot reach the game server. Reconnecting…' });
});
socket.on('server:status', ({ persistence, state, message } = {}) => {
  setStatus({
    persistence: persistence || 'unknown',
    serverState: state || 'unknown',
    message: message || null,
  });
});

/** URL of a generated art asset in client/public/art/. */
export const artUrl = (file) => `${basePath}/art/${file}`;

/** Never queue game actions offline or replay a move with an uncertain result. */
export function call(event, payload = {}) {
  if (!socket.connected) return Promise.reject(new Error('You are offline. Wait for the game to reconnect before trying that again.'));
  if (event !== 'hello' && !status.sessionReady) {
    return Promise.reject(new Error('Your player is still reconnecting. Please wait a moment.'));
  }
  if (status.serverState === 'paused' && event !== 'hello' && event !== 'rooms:list') {
    return Promise.reject(new Error(status.message || 'Game saving is temporarily unavailable. Your last saved position is safe.'));
  }
  const attempt = event === 'hello' ? ++helloAttempt : helloAttempt;
  if (event === 'hello') setStatus({ sessionReady: false, recovering: true });
  return new Promise((resolve, reject) => {
    socket.timeout(15000).emit(event, payload, (err, res) => {
      if (attempt !== helloAttempt) return reject(new Error('The connection changed. Wait for your player to reconnect.'));
      if (err) {
        if (event === 'hello') setStatus({ sessionReady: false, recovering: false });
        // An unacknowledged move might already have committed. A new hello
        // fetches the authoritative saved state; the move itself is not retried.
        if (event !== 'rooms:list' && socket.connected) socket.disconnect().connect();
        return reject(new Error('No confirmation received. Reconnecting to check your saved game; your action will not be repeated automatically.'));
      }
      if (res?.error) {
        if (event === 'hello') setStatus({ sessionReady: false, recovering: false, message: res.error });
        const error = new Error(res.error);
        error.retryable = Boolean(res.retryable);
        return reject(error);
      }
      if (event === 'hello') setStatus({ sessionReady: true, recovering: false });
      resolve(res || {});
    });
  });
}
