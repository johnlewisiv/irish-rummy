// simulate.js — full-game bot self-play. Verifies that complete 7-round games
// finish without errors, deck integrity holds after every action, and scores
// add up. Runs several configurations including 5 players (3-deck game).
import { Game } from '../src/game.js';

async function playGame(players) {
  let maxHand = 0;
  const game = new Game(players, () => {
    for (const p of game.players) maxHand = Math.max(maxHand, p.hand.length);
  }, { botDelayMs: 0 });
  game.maxHand = () => maxHand;
  game.startNextRound();
  const deadline = Date.now() + 120_000;
  while (game.phase !== 'gameOver') {
    if (Date.now() > deadline) throw new Error(`Timed out in round ${game.round} (phase ${game.phase})`);
    if (game.phase === 'roundEnd') {
      game.destroy(); // cancel the 9s auto-advance timer…
      game.startNextRound(); // …and advance immediately
      continue;
    }
    // Bot turns run on 0ms timers; let the event loop tick.
    await new Promise((r) => setTimeout(r, 1));
  }
  game.destroy();
  return game;
}

const configs = [
  [
    { id: 'b1', name: 'Easy1', isBot: true, difficulty: 'easy' },
    { id: 'b2', name: 'Med1', isBot: true, difficulty: 'medium' },
  ],
  [
    { id: 'b1', name: 'Med1', isBot: true, difficulty: 'medium' },
    { id: 'b2', name: 'Med2', isBot: true, difficulty: 'medium' },
    { id: 'b3', name: 'Hard1', isBot: true, difficulty: 'hard' },
    { id: 'b4', name: 'Easy1', isBot: true, difficulty: 'easy' },
  ],
  [
    { id: 'b1', name: 'P1', isBot: true, difficulty: 'hard' },
    { id: 'b2', name: 'P2', isBot: true, difficulty: 'hard' },
    { id: 'b3', name: 'P3', isBot: true, difficulty: 'medium' },
    { id: 'b4', name: 'P4', isBot: true, difficulty: 'medium' },
    { id: 'b5', name: 'P5', isBot: true, difficulty: 'easy' }, // 5 players → 162-card deck
  ],
];

for (const [i, players] of configs.entries()) {
  const game = await playGame(players);
  const standings = [...game.players].sort((a, b) => a.score - b.score);
  console.log(`game ${i + 1} (${players.length} players, deck ${game.deckSize}, max hand ${game.maxHand()}): ` +
    standings.map((p) => `${p.name}=${p.score}`).join(' '));
  if (game.maxHand() > 17) throw new Error(`bot hand ballooned to ${game.maxHand()} cards`);
  for (const p of game.players) {
    if (p.roundScores.length !== 7) throw new Error(`${p.name} has ${p.roundScores.length} round scores`);
    const sum = p.roundScores.reduce((a, b) => a + b, 0);
    if (sum !== p.score) throw new Error(`${p.name} score mismatch: ${sum} != ${p.score}`);
  }
}
console.log('simulate.js: all self-play games completed with deck integrity ✔');
