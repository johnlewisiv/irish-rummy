// game.js — the Game engine. One instance per room. Pure in-memory state.
// The physical deck is conserved: drawPile + discardPile + hands + table melds
// always contain exactly the cards built by buildDeck(). assertDeckIntegrity()
// verifies this after every action.

import { buildDeck, shuffle, cardPoints } from './deck.js';
import {
  CONTRACTS, TOTAL_ROUNDS, validateGoDown, validateStraight,
  layoffOptions, jokerSwapIndex, solveContract,
} from './rules.js';
import { botDraw, botAct, botDiscard, botWantsBuy } from './bots.js';

let meldSeq = 0;

function clonePlain(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return JSON.parse(JSON.stringify(value));
}

function syncMeldSeq(tableMelds) {
  for (const meld of tableMelds || []) {
    const n = /^m(\d+)$/.exec(meld.id || '')?.[1];
    if (n !== undefined) meldSeq = Math.max(meldSeq, Number(n) + 1);
  }
}

export class Game {
  /**
   * @param {object[]} players [{id, name, isBot, difficulty}]
   * @param {function} onChange called after every state change (broadcast hook)
   * @param {object} opts { botDelayMs }
   */
  constructor(players, onChange, opts = {}) {
    this.players = players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: !!p.isBot,
      difficulty: p.difficulty || 'medium',
      avatar: p.avatar || null,
      connected: true,
      hand: [],
      hasGoneDown: false,
      score: 0,
      roundScores: [],
    }));
    this.onChange = onChange || (() => {});
    this.botDelayMs = opts.botDelayMs ?? Number(process.env.BOT_DELAY_MS ?? 1200);
    this.deckSize = buildDeck(this.players.length).length;

    this.round = 0;
    this.dealerIndex = Math.floor(Math.random() * this.players.length);
    this.phase = 'idle'; // idle | playing | roundEnd | gameOver
    this.turnPhase = null; // draw | action
    this.currentIndex = 0;
    this.drawPile = [];
    this.discardPile = [];
    this.tableMelds = [];
    this.buyRequests = []; // player ids who want the top discard this window
    this.buyPasses = new Set(); // player ids who passed on the top discard
    // The buy window: after every discard, everyone else gets a chance to buy
    // or pass before the next deck draw happens.
    //   > 0  = countdown of that many ms (pausable)
    //   0    = casual mode: no countdown, waits until everyone buys/passes
    //   null = windows disabled entirely (test/compat mode)
    this.buyWindowMs = opts.buyWindowMs !== undefined
      ? opts.buyWindowMs
      : Number(process.env.BUY_WINDOW_MS ?? 8000);
    this.buyWindow = null; // { expiresAt, timer, pendingDraw, paused, remainingMs }
    this.maxBuysPerRound = opts.maxBuysPerRound ?? 3; // house rule: 3 buys each per round
    this.buysUsed = {}; // playerId -> buys spent THIS ROUND (resets every deal)
    this.mustPlayJoker = {}; // playerId -> cardId (joker taken via swap)
    this.lastEvent = null; // human-readable log line
    this.log = []; // [{t, msg, type}] full game record (info | buy | round)
    this.buys = []; // [{round, name, card}] the buy ledger
    this.roundSummary = null;
    this._timers = [];
  }

  static fromSnapshot(snapshot, onChange, opts = {}) {
    const players = (snapshot.players || []).map((p) => ({
      id: p.id,
      name: p.name,
      isBot: !!p.isBot,
      difficulty: p.difficulty || 'medium',
      avatar: p.avatar || null,
    }));
    const game = new Game(players, onChange, {
      ...opts,
      botDelayMs: opts.botDelayMs ?? snapshot.botDelayMs,
      buyWindowMs: opts.buyWindowMs ?? snapshot.buyWindowMs,
      maxBuysPerRound: snapshot.maxBuysPerRound,
    });
    game.players = (snapshot.players || []).map((p) => ({
      id: p.id,
      name: p.name,
      isBot: !!p.isBot,
      difficulty: p.difficulty || 'medium',
      avatar: p.avatar || null,
      connected: !!p.isBot,
      hand: clonePlain(p.hand, []),
      hasGoneDown: !!p.hasGoneDown,
      score: Number(p.score || 0),
      roundScores: clonePlain(p.roundScores, []),
    }));
    game.botDelayMs = opts.botDelayMs ?? snapshot.botDelayMs ?? Number(process.env.BOT_DELAY_MS ?? 1200);
    game.deckSize = snapshot.deckSize ?? buildDeck(game.players.length).length;
    game.round = Number(snapshot.round || 0);
    game.dealerIndex = Number(snapshot.dealerIndex || 0);
    game.phase = snapshot.phase || 'idle';
    game.turnPhase = snapshot.turnPhase || null;
    game.currentIndex = Number(snapshot.currentIndex || 0);
    game.drawPile = clonePlain(snapshot.drawPile, []);
    game.discardPile = clonePlain(snapshot.discardPile, []);
    game.tableMelds = clonePlain(snapshot.tableMelds, []);
    game.buyRequests = clonePlain(snapshot.buyRequests, []);
    game.buyPasses = new Set(snapshot.buyPasses || []);
    game.buyWindowMs = snapshot.buyWindowMs !== undefined ? snapshot.buyWindowMs : Number(process.env.BUY_WINDOW_MS ?? 8000);
    game.buyWindow = snapshot.buyWindow ? {
      expiresAt: null,
      timer: null,
      pendingDraw: snapshot.buyWindow.pendingDraw || null,
      paused: !!snapshot.buyWindow.paused,
      remainingMs: snapshot.buyWindow.remainingMs ?? null,
    } : null;
    game.maxBuysPerRound = Number(snapshot.maxBuysPerRound || 3);
    game.buysUsed = clonePlain(snapshot.buysUsed, {});
    game.mustPlayJoker = clonePlain(snapshot.mustPlayJoker, {});
    game.lastEvent = snapshot.lastEvent || null;
    game.log = clonePlain(snapshot.log, []);
    game.buys = clonePlain(snapshot.buys, []);
    game.roundSummary = clonePlain(snapshot.roundSummary, null);
    game._timers = [];
    syncMeldSeq(game.tableMelds);
    if (game.phase !== 'idle') game.assertDeckIntegrity();
    game._resumeRuntime();
    return game;
  }

  toSnapshot() {
    return {
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        isBot: !!p.isBot,
        difficulty: p.difficulty,
        avatar: p.avatar,
        hand: p.hand,
        hasGoneDown: p.hasGoneDown,
        score: p.score,
        roundScores: p.roundScores,
      })),
      botDelayMs: this.botDelayMs,
      deckSize: this.deckSize,
      round: this.round,
      dealerIndex: this.dealerIndex,
      phase: this.phase,
      turnPhase: this.turnPhase,
      currentIndex: this.currentIndex,
      drawPile: this.drawPile,
      discardPile: this.discardPile,
      tableMelds: this.tableMelds,
      buyRequests: this.buyRequests,
      buyPasses: [...this.buyPasses],
      buyWindowMs: this.buyWindowMs,
      buyWindow: this.buyWindow ? {
        pendingDraw: this.buyWindow.pendingDraw || null,
        paused: !!this.buyWindow.paused,
        remainingMs: this.buyWindow.paused
          ? (this.buyWindow.remainingMs ?? null)
          : this.buyWindow.expiresAt
            ? Math.max(1000, this.buyWindow.expiresAt - Date.now())
            : null,
      } : null,
      maxBuysPerRound: this.maxBuysPerRound,
      buysUsed: this.buysUsed,
      mustPlayJoker: this.mustPlayJoker,
      lastEvent: this.lastEvent,
      log: this.log,
      buys: this.buys,
      roundSummary: this.roundSummary,
    };
  }

  _resumeRuntime() {
    this._restoreBuyWindowTimer();
    if (this.phase === 'roundEnd') {
      const t = setTimeout(() => this.startNextRound() || this.onChange(),
        Number(process.env.ROUND_PAUSE_MS ?? 9000));
      this._timers.push(t);
    } else {
      this._scheduleBot();
    }
  }

  _restoreBuyWindowTimer() {
    const w = this.buyWindow;
    if (!w || this.buyWindowMs === 0 || w.paused) return;
    const delay = Math.max(1000, w.remainingMs || this.buyWindowMs);
    w.expiresAt = Date.now() + delay;
    w.timer = setTimeout(() => {
      this._closeBuyWindow(true);
      this.onChange();
    }, delay);
    this._timers.push(w.timer);
  }

  /* ---------------- round lifecycle ---------------- */

  startNextRound() {
    this.round += 1;
    if (this.round > TOTAL_ROUNDS) {
      this.phase = 'gameOver';
      this._emit('Game over!');
      return;
    }
    const contract = CONTRACTS[this.round];
    const deck = shuffle(buildDeck(this.players.length));
    for (const p of this.players) {
      p.hand = deck.splice(0, contract.deal);
      p.hasGoneDown = false;
    }
    this.tableMelds = [];
    this.discardPile = [deck.shift()]; // flip top card to start discard pile
    this.drawPile = deck;
    this.mustPlayJoker = {};
    this.buysUsed = {}; // everyone gets their 3 buys back each round
    this.dealerIndex = (this.round === 1)
      ? this.dealerIndex
      : (this.dealerIndex + 1) % this.players.length;
    this.currentIndex = (this.dealerIndex + 1) % this.players.length;
    this.phase = 'playing';
    this.turnPhase = 'draw';
    this.roundSummary = null;
    this._emit(`Round ${this.round}: ${contract.label}. ${this.currentPlayer().name} starts.`, 'round');
    this._openBuyWindow();
    this._scheduleBot();
  }

  currentPlayer() { return this.players[this.currentIndex]; }
  getPlayer(id) { return this.players.find((p) => p.id === id); }

  /* ---------------- actions ---------------- */

  /** Draw a card. from = 'deck' | 'discard'. Only the current player, in draw phase. */
  draw(playerId, from) {
    const p = this._requireTurn(playerId, 'draw');
    if (this.buyWindow?.pendingDraw) throw new Err('Waiting for everyone to buy or pass…');
    if (from === 'discard') {
      if (this.discardPile.length === 0) throw new Err('Discard pile is empty.');
      // The current player has first priority — taking the card voids all buys.
      this._closeBuyWindow(false);
      this.buyRequests = [];
      this.buyPasses = new Set();
      const card = this.discardPile.pop();
      p.hand.push(card);
      this._emit(`${p.name} took the ${cardName(card)} from the discard pile.`);
      this.turnPhase = 'action';
      this._afterAction();
    } else {
      // Drawing from the deck declines the discard. If the buy window is still
      // open, the draw is HELD until everyone has bought/passed or time is up.
      if (this.buyWindow) {
        this.buyWindow.pendingDraw = p.id;
        this._emit(`${p.name} is drawing — last chance to buy the ${cardName(this.top())}!`);
        this._maybeCloseBuyWindow(); // everyone may have already responded
        if (this.buyWindow) this.onChange(); // still waiting
        return;
      }
      this._performDeckDraw(p);
    }
  }

  /** The actual deck draw: buyers get their card first, then the drawer. */
  _performDeckDraw(p) {
    this._resolveBuys();
    this._ensureDrawPile();
    p.hand.push(this.drawPile.shift());
    this._emit(`${p.name} drew from the deck.`);
    this.turnPhase = 'action';
    this._afterAction();
  }

  /** Out-of-turn buy request for the top discard (resolved when current player draws from deck). */
  requestBuy(playerId) {
    if (this.phase !== 'playing' || this.turnPhase !== 'draw') throw new Err('No card can be bought right now.');
    if (playerId === this.currentPlayer().id) throw new Err("It's your turn — just take the card.");
    if (this.discardPile.length === 0) throw new Err('Nothing to buy.');
    const p = this.getPlayer(playerId);
    if (!p) throw new Err('Not in this game.');
    if ((this.buysUsed[playerId] || 0) >= this.maxBuysPerRound) {
      throw new Err(`You have used all ${this.maxBuysPerRound} buys for this round — they come back next round.`);
    }
    this.buyPasses.delete(playerId);
    if (!this.buyRequests.includes(playerId)) {
      this.buyRequests.push(playerId);
      this._emit(`${p.name} wants to buy the ${cardName(this.top())}.`);
    }
    this._maybeCloseBuyWindow();
    this.onChange();
  }

  /** Explicitly pass on the top discard (closes the buy window faster). */
  passBuy(playerId) {
    if (this.phase !== 'playing' || this.turnPhase !== 'draw') return this.onChange();
    if (playerId === this.currentPlayer().id) throw new Err("It's your turn — draw a card.");
    const p = this.getPlayer(playerId);
    if (!p) throw new Err('Not in this game.');
    this.buyRequests = this.buyRequests.filter((id) => id !== playerId);
    this.buyPasses.add(playerId);
    this._maybeCloseBuyWindow();
    this.onChange();
  }

  cancelBuy(playerId) {
    this.buyRequests = this.buyRequests.filter((id) => id !== playerId);
    this.onChange();
  }

  top() { return this.discardPile[this.discardPile.length - 1]; }

  /* ----- the buy window ----- */

  /** Open a buy/pass window for the fresh top discard. Bots answer instantly. */
  _openBuyWindow() {
    this.buyRequests = [];
    this.buyPasses = new Set();
    if (this.buyWindowMs === null || this.buyWindowMs < 0 || !this.top()) return;
    const others = this.players.filter((_, i) => i !== this.currentIndex);
    for (const b of others.filter((p) => p.isBot)) {
      if (botWantsBuy(b, this.top(), this)) this.buyRequests.push(b.id);
      else this.buyPasses.add(b.id);
    }
    // Only wait if there are connected humans who still need to decide.
    if (!others.some((p) => !p.isBot && p.connected)) return;
    if (this.buyWindowMs === 0) {
      // Casual mode: no countdown — the window stays open until everyone
      // has bought or passed (or the current player takes the discard).
      this.buyWindow = { expiresAt: null, timer: null, pendingDraw: null, paused: false };
      return;
    }
    const timer = setTimeout(() => {
      this._closeBuyWindow(true);
      this.onChange();
    }, this.buyWindowMs);
    this.buyWindow = { expiresAt: Date.now() + this.buyWindowMs, timer, pendingDraw: null, paused: false };
  }

  /** Pause the buy countdown (any player — think as long as you like). */
  pauseBuy(playerId) {
    const p = this.getPlayer(playerId);
    if (!p) throw new Err('Not in this game.');
    const w = this.buyWindow;
    if (!w || !w.timer || w.paused) return this.onChange();
    clearTimeout(w.timer);
    w.timer = null;
    w.paused = true;
    w.remainingMs = Math.max(1000, w.expiresAt - Date.now());
    w.expiresAt = null;
    this._emit(`⏸ ${p.name} paused the buy timer.`);
    this.onChange();
  }

  /** Resume a paused buy countdown. */
  resumeBuy(playerId) {
    const p = this.getPlayer(playerId);
    if (!p) throw new Err('Not in this game.');
    const w = this.buyWindow;
    if (!w || !w.paused) return this.onChange();
    w.paused = false;
    w.expiresAt = Date.now() + w.remainingMs;
    w.timer = setTimeout(() => {
      this._closeBuyWindow(true);
      this.onChange();
    }, w.remainingMs);
    this._emit(`▶ ${p.name} resumed the buy timer.`);
    this.onChange();
  }

  _hasResponded(p) { return this.buyRequests.includes(p.id) || this.buyPasses.has(p.id); }

  /** Close the window early once every connected non-current human responded. */
  _maybeCloseBuyWindow() {
    if (!this.buyWindow) return;
    const waiting = this.players.filter((p, i) =>
      i !== this.currentIndex && !p.isBot && p.connected && !this._hasResponded(p));
    if (waiting.length === 0) this._closeBuyWindow(true);
  }

  /** @param {boolean} execute run the held deck draw (false when voiding). */
  _closeBuyWindow(execute) {
    if (!this.buyWindow) return;
    clearTimeout(this.buyWindow.timer);
    const held = this.buyWindow.pendingDraw;
    this.buyWindow = null;
    if (execute && held) this._performDeckDraw(this.getPlayer(held));
  }

  /** Resolve buys in clockwise priority from the player after the current one. */
  _resolveBuys() {
    if (this.discardPile.length === 0) { this.buyRequests = []; return; }
    const card = this.top();
    const n = this.players.length;
    for (let k = 1; k < n; k++) {
      const p = this.players[(this.currentIndex + k) % n];
      if (this.buyRequests.includes(p.id) && (this.buysUsed[p.id] || 0) < this.maxBuysPerRound) {
        this.discardPile.pop();
        p.hand.push(card);
        this._ensureDrawPile();
        p.hand.push(this.drawPile.shift()); // the extra penalty card
        this.buysUsed[p.id] = (this.buysUsed[p.id] || 0) + 1;
        const left = this.maxBuysPerRound - this.buysUsed[p.id];
        this.buys.push({ round: this.round, name: p.name, card: cardName(card) });
        this._emit(`💰 ${p.name} bought the ${cardName(card)} (+1 penalty card, ${left} buy${left === 1 ? '' : 's'} left this round).`, 'buy');
        break; // only the highest-priority buyer gets it
      }
    }
    this.buyRequests = [];
    this.buyPasses = new Set();
  }

  /**
   * Go down with the round contract.
   * meldSpecs: [{type:'set'|'straight', cardIds:[...]}] — straights ordered low→high.
   */
  goDown(playerId, meldSpecs) {
    const p = this._requireTurn(playerId, 'action');
    if (p.hasGoneDown) throw new Err('You have already gone down.');
    const melds = meldSpecs.map((spec) => ({
      type: spec.type,
      cards: spec.cardIds.map((id) => this._cardFromHand(p, id)),
    }));
    const res = validateGoDown(melds, this.round);
    if (!res.ok) throw new Err(res.error);
    // Commit: remove from hand, place on table
    for (const m of res.validated) {
      for (const c of m.cards) p.hand.splice(p.hand.findIndex((h) => h.id === c.id), 1);
      this.tableMelds.push(this._makeTableMeld(p.id, m));
    }
    p.hasGoneDown = true;
    this._emit(`${p.name} went down!`);
    this._afterAction();
  }

  /** Add one card from hand to a table meld. end: 'low'|'high' (straights only). */
  layOff(playerId, meldId, cardId, end) {
    const p = this._requireTurn(playerId, 'action');
    if (!p.hasGoneDown) throw new Err('You must go down before playing on melds.');
    const meld = this.tableMelds.find((m) => m.id === meldId);
    if (!meld) throw new Err('Meld not found.');
    const card = this._cardFromHand(p, cardId);
    const opts = layoffOptions(card, meld);
    if (!opts) throw new Err("That card doesn't fit there.");
    if (meld.type === 'straight' && card.joker && opts.low && opts.high && !['low', 'high'].includes(end)) {
      throw new Err('Choose low or high end for this joker.');
    }
    p.hand.splice(p.hand.findIndex((h) => h.id === cardId), 1);
    if (meld.type === 'set') {
      meld.cards.push(card); // sets die: order/manipulation is irrelevant
    } else {
      const side = end === 'low' && opts.low ? 'low' : end === 'high' && opts.high ? 'high'
        : opts.low ? 'low' : 'high';
      if (side === 'low') { meld.cards.unshift(card); meld.startValue -= 1; }
      else meld.cards.push(card);
      this._refreshStraight(meld);
    }
    if (this.mustPlayJoker[p.id] === cardId) delete this.mustPlayJoker[p.id];
    this._emit(`${p.name} played the ${cardName(card)} on a ${meld.type}.`);
    this._afterAction();
  }

  /**
   * Swap a natural card from hand for a joker in a table straight.
   * The joker goes to the player's hand but MUST be played before discarding.
   */
  swapJoker(playerId, meldId, cardId) {
    const p = this._requireTurn(playerId, 'action');
    if (!p.hasGoneDown) throw new Err('You must go down before swapping jokers.');
    if (this.mustPlayJoker[p.id]) throw new Err('Play your first joker before swapping another.');
    const meld = this.tableMelds.find((m) => m.id === meldId);
    if (!meld) throw new Err('Meld not found.');
    const card = this._cardFromHand(p, cardId);
    const idx = jokerSwapIndex(card, meld);
    if (idx < 0) throw new Err('That card does not match a joker in this straight.');
    const joker = meld.cards[idx];
    meld.cards[idx] = card;
    p.hand.splice(p.hand.findIndex((h) => h.id === cardId), 1);
    p.hand.push(joker);
    this.mustPlayJoker[p.id] = joker.id;
    this._refreshStraight(meld);
    this._emit(`${p.name} swapped the ${cardName(card)} for a joker — the joker must be replayed.`);
    this._afterAction();
  }

  /** Discard to end the turn. */
  discard(playerId, cardId) {
    const p = this._requireTurn(playerId, 'action');
    // A joker taken by swap must be replayed before discarding — the only
    // escape hatch is discarding the joker itself (a terrible but legal move).
    if (this.mustPlayJoker[p.id] && this.mustPlayJoker[p.id] !== cardId) {
      throw new Err('You must play the joker you took before discarding.');
    }
    const card = this._cardFromHand(p, cardId);
    if (this.mustPlayJoker[p.id] === cardId) delete this.mustPlayJoker[p.id];
    p.hand.splice(p.hand.findIndex((h) => h.id === cardId), 1);
    this.discardPile.push(card);
    this._emit(`${p.name} discarded the ${cardName(card)}.`);
    if (p.hand.length === 0 && p.hasGoneDown) return this._endRound(p);
    this._nextTurn();
  }

  /* ---------------- internals ---------------- */

  _requireTurn(playerId, phase) {
    if (this.phase !== 'playing') throw new Err('The round is not in progress.');
    const p = this.currentPlayer();
    if (p.id !== playerId) throw new Err("It's not your turn.");
    if (this.turnPhase !== phase) {
      throw new Err(phase === 'draw' ? 'You have already drawn.' : 'Draw a card first.');
    }
    return p;
  }

  _cardFromHand(p, cardId) {
    const card = p.hand.find((c) => c.id === cardId);
    if (!card) throw new Err('Card not in your hand.');
    return card;
  }

  _makeTableMeld(ownerId, m) {
    const meld = { id: `m${meldSeq++}`, ownerId, type: m.type, cards: [...m.cards] };
    if (m.type === 'set') meld.rank = m.rank;
    else { meld.suit = m.suit; meld.startValue = m.startValue; meld.repr = m.repr; }
    return meld;
  }

  _refreshStraight(meld) {
    const res = validateStraight(meld.cards);
    if (!res.ok) throw new Err('Internal error: straight became invalid.');
    meld.suit = res.suit;
    meld.startValue = res.startValue;
    meld.repr = res.repr;
  }

  _ensureDrawPile() {
    if (this.drawPile.length > 0) return;
    // Reshuffle the discard pile (except the top card) into a new draw pile.
    const topCard = this.discardPile.pop();
    this.drawPile = shuffle(this.discardPile);
    this.discardPile = topCard ? [topCard] : [];
    if (this.drawPile.length === 0) throw new Err('No cards left to draw.');
    this._emit('Draw pile empty — reshuffled the discards.');
  }

  /** After go-out check + integrity check + broadcast. */
  _afterAction() {
    const p = this.currentPlayer();
    if (p.hand.length === 0 && p.hasGoneDown) return this._endRound(p);
    this.assertDeckIntegrity();
    this.onChange();
    this._scheduleBot(); // bot may be mid-turn (action phase)
  }

  _nextTurn() {
    this.currentIndex = (this.currentIndex + 1) % this.players.length;
    this.turnPhase = 'draw';
    this._openBuyWindow(); // fresh discard → everyone gets a buy/pass chance
    this.assertDeckIntegrity();
    this.onChange();
    this._scheduleBot();
  }

  _endRound(winner) {
    this._closeBuyWindow(false);
    this.phase = 'roundEnd';
    const scores = this.players.map((p) => {
      const pts = p.hand.reduce((s, c) => s + cardPoints(c), 0);
      p.roundScores.push(pts);
      p.score += pts;
      return { id: p.id, name: p.name, roundPoints: pts, total: p.score, leftover: p.hand.map(cardName) };
    });
    this.roundSummary = { round: this.round, winner: winner.name, scores };
    this._emit(`${winner.name} went out! Round ${this.round} over.`);
    this.assertDeckIntegrity();
    this.onChange();
    // Auto-advance to next round (players do not move on until everyone is ready —
    // the pause gives everyone time to see the scores).
    const t = setTimeout(() => this.startNextRound() || this.onChange(),
      Number(process.env.ROUND_PAUSE_MS ?? 9000));
    this._timers.push(t);
  }

  /** The whole physical deck must always be accounted for. */
  assertDeckIntegrity() {
    let count = this.drawPile.length + this.discardPile.length;
    const ids = new Set([...this.drawPile, ...this.discardPile].map((c) => c.id));
    for (const p of this.players) {
      count += p.hand.length;
      p.hand.forEach((c) => ids.add(c.id));
    }
    for (const m of this.tableMelds) {
      count += m.cards.length;
      m.cards.forEach((c) => ids.add(c.id));
    }
    if (count !== this.deckSize || ids.size !== this.deckSize) {
      throw new Error(`DECK INTEGRITY VIOLATION: ${count} cards counted, ${ids.size} unique, expected ${this.deckSize}`);
    }
  }

  destroy() {
    this._timers.forEach(clearTimeout);
    this._timers = [];
    if (this.buyWindow) { clearTimeout(this.buyWindow.timer); this.buyWindow = null; }
  }

  _emit(msg, type = 'info') {
    this.lastEvent = msg;
    this.log.push({ t: Date.now(), msg, type });
    if (this.log.length > 300) this.log.shift();
  }

  /* ---------------- bots ---------------- */

  _scheduleBot() {
    if (this.phase !== 'playing') return;
    const p = this.currentPlayer();
    if (!p.isBot) return;
    const t = setTimeout(() => {
      try { this._botStep(p); } catch (e) {
        // A bot must never wedge the game: fall back to safe moves.
        try { this._botFailsafe(p); } catch { /* ignore */ }
      }
    }, this.botDelayMs);
    this._timers.push(t);
  }

  _botStep(p) {
    if (this.phase !== 'playing' || this.currentPlayer().id !== p.id) return;
    if (this.turnPhase === 'draw') {
      this.draw(p.id, botDraw(p, this));
      return; // _afterAction re-schedules for the action phase
    }
    // Action phase: go down / lay off as the difficulty dictates, then discard.
    const acted = botAct(p, this); // performs goDown/layOff via engine methods
    if (acted) return; // engine re-scheduled us; continue next tick
    if (this.phase !== 'playing' || this.currentPlayer().id !== p.id) return;
    const cardId = botDiscard(p, this);
    this.discard(p.id, cardId);
  }

  _botFailsafe(p) {
    if (this.phase !== 'playing' || this.currentPlayer().id !== p.id) return;
    if (this.turnPhase === 'draw') this.draw(p.id, 'deck');
    if (this.phase === 'playing' && this.currentPlayer().id === p.id && this.turnPhase === 'action') {
      const joker = this.mustPlayJoker[p.id];
      this.discard(p.id, joker || p.hand[0].id);
    }
  }

  /* ---------------- views ---------------- */

  /** Personalized view: only your own hand is visible; others show card counts. */
  viewFor(viewerId) {
    return {
      phase: this.phase,
      round: this.round,
      contract: this.round >= 1 && this.round <= TOTAL_ROUNDS ? CONTRACTS[this.round] : null,
      totalRounds: TOTAL_ROUNDS,
      currentPlayerId: this.phase === 'playing' ? this.currentPlayer().id : null,
      turnPhase: this.turnPhase,
      drawCount: this.drawPile.length,
      discardTop: this.top() || null,
      discardCount: this.discardPile.length,
      tableMelds: this.tableMelds,
      buyRequests: this.buyRequests,
      buyPasses: [...this.buyPasses],
      buyWindow: this.buyWindow ? {
        expiresAt: this.buyWindow.expiresAt,
        windowMs: this.buyWindowMs,
        untimed: this.buyWindowMs === 0,
        paused: !!this.buyWindow.paused,
        pendingDraw: !!this.buyWindow.pendingDraw,
        waitingOn: this.players
          .filter((p, i) => i !== this.currentIndex && !p.isBot && p.connected && !this._hasResponded(p))
          .map((p) => p.name),
      } : null,
      maxBuysPerRound: this.maxBuysPerRound,
      mustPlayJoker: this.mustPlayJoker[viewerId] || null,
      lastEvent: this.lastEvent,
      log: this.log.slice(-80),
      buys: this.buys,
      roundSummary: this.roundSummary,
      canGoDownHint: this._goDownHint(viewerId),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        difficulty: p.isBot ? p.difficulty : undefined,
        avatar: p.avatar,
        connected: p.connected,
        handCount: p.hand.length,
        hand: p.id === viewerId ? p.hand : undefined,
        hasGoneDown: p.hasGoneDown,
        score: p.score,
        roundScores: p.roundScores,
        buysUsed: this.buysUsed[p.id] || 0,
      })),
    };
  }

  /** If the viewer could go down right now, return a suggested meld split. */
  _goDownHint(viewerId) {
    if (this.phase !== 'playing') return null;
    const p = this.getPlayer(viewerId);
    if (!p || p.isBot || p.hasGoneDown) return null;
    const solution = solveContract(p.hand, this.round);
    if (!solution) return null;
    return solution.melds.map((m) => ({ type: m.type, cardIds: m.cards.map((c) => c.id) }));
  }
}

/** Player-facing error (safe to send to the client). */
export class Err extends Error {
  constructor(msg) { super(msg); this.playerFacing = true; }
}

export function cardName(card) {
  if (card.joker) return 'Joker';
  const suits = { S: '♠', H: '♥', D: '♦', C: '♣' };
  return `${card.rank}${suits[card.suit]}`;
}
