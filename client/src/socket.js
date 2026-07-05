// socket.js — single Socket.io connection + session identity.
// The session token lives in localStorage so a page refresh (or a dropped
// connection) reconnects you to your seat mid-game.
import { io } from 'socket.io-client';

export function getToken() {
  // sessionStorage is PER TAB (and survives reloads in that tab): every tab is
  // its own player, so a family can even share one computer with two windows.
  // localStorage would silently make two tabs control the same seat.
  let t = sessionStorage.getItem('rummy.token');
  if (!t) {
    t = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)) + Date.now().toString(36);
    sessionStorage.setItem('rummy.token', t);
  }
  return t;
}

export function getSavedName() { return localStorage.getItem('rummy.name') || ''; }
export function saveName(name) { localStorage.setItem('rummy.name', name); }

// Works whether the app is served at / or at /rummy/ behind a proxy.
const basePath = new URL('.', window.location.href).pathname.replace(/\/$/, '');
export const socket = io({ path: `${basePath}/socket.io` });

/** URL of a generated art asset in client/public/art/. */
export const artUrl = (file) => `${basePath}/art/${file}`;

/** emit with ack → Promise; rejects with the server's player-facing error. */
export function call(event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (err, res) => {
      if (err) return reject(new Error('No response from server.'));
      if (res?.error) return reject(new Error(res.error));
      resolve(res || {});
    });
  });
}
