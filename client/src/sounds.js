// sounds.js — tiny synthesized sound effects (no audio files needed).
let ctx = null;
const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

export function soundOn() { return localStorage.getItem('rummy.sound') !== '0'; }
export function toggleSound() {
  localStorage.setItem('rummy.sound', soundOn() ? '0' : '1');
  return soundOn();
}

function tone(freq, dur, delay = 0, type = 'sine', vol = 0.12) {
  if (!soundOn()) return;
  try {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, a.currentTime + delay);
    g.gain.linearRampToValueAtTime(vol, a.currentTime + delay + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + delay + dur);
    o.connect(g).connect(a.destination);
    o.start(a.currentTime + delay);
    o.stop(a.currentTime + delay + dur + 0.05);
  } catch { /* audio blocked — fine */ }
}

/** Your turn! */
export const dingTurn = () => { tone(660, 0.18); tone(880, 0.25, 0.12); };
/** A card you might want to buy just appeared. */
export const chimeBuy = () => tone(520, 0.14, 0, 'triangle');
/** Round over. */
export const roundEnd = () => { tone(523, 0.15); tone(659, 0.15, 0.13); tone(784, 0.3, 0.26); };
/** You won the game! */
export const fanfare = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, i * 0.16));
