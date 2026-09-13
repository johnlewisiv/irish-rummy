const label = (card) => !card ? 'discard' : card.joker ? 'Joker' : `${card.rank}${({S:'♠',H:'♥',D:'♦',C:'♣'})[card.suit]}`;

/** One contextual instruction. New decisions outrank receipts from older turns. */
export function decisionView({ game, you, role, health, busy, selected = [] }) {
  const me = game.players.find(p => p.id === you);
  const player = role === 'player' && !!me;
  const mine = player && game.currentPlayerId === you;
  const drawer = game.players.find(p => p.id === game.currentPlayerId)?.name || 'The next player';
  const card = label(game.discardTop);
  const buys = Math.max(0, (game.maxBuysPerRound ?? 3) - (me?.buysUsed ?? 0));
  if (health && (!health.connected || !health.sessionReady || health.recovering || health.serverState === 'paused')) return { kind:'locked', title:health.serverState === 'paused' ? 'Saving is temporarily unavailable' : 'Reconnecting', detail:'Checking your last saved choice…' };
  if (busy) return { kind:'locked', title:'Saving your choice…', detail:'Waiting for confirmation.' };
  if (game.phase !== 'playing') return { kind:'waiting', title:game.phase === 'gameOver' ? 'Game complete' : 'Round complete', detail:'' };
  if (!player) return { kind:'waiting', title:`${drawer}’s turn`, detail:'You are watching this table.' };
  if (mine && game.turnPhase === 'draw') {
    if (game.pendingDraw || game.buyWindow?.pendingDraw) return { kind:'held', title:'Deck draw saved', detail:`Waiting for ${game.buyWindow?.waitingOn?.join(' and ') || 'the other players'} to buy or pass.` };
    return { kind:'draw', title:'Your turn. Draw one card.', detail:'Choose the deck or the top discard.', card };
  }
  if (mine && game.turnPhase === 'action') return { kind:'action', title:game.mustPlayJoker ? 'Play or discard the joker you picked up.' : game.canGoDownHint && !me.hasGoneDown ? 'Your cards are ready to go down.' : 'Select a card to discard.', detail:me.hasGoneDown ? 'You can also add cards to any meld on the table.' : 'Going down is optional before you discard.', canDiscard:selected.length === 1 && (!game.mustPlayJoker || game.mustPlayJoker === selected[0]), canStage:!me.hasGoneDown };
  if (game.turnPhase === 'draw' && game.discardTop && !game.buyDecisionClosed && buys > 0) {
    if (game.buyRequests.includes(you)) return { kind:'requested', title:'Buy requested', detail:`If ${drawer} draws from the deck, the first buyer clockwise gets ${card}.`, card, buys };
    if (game.buyPasses?.includes(you)) return { kind:'passed', title:`Passed on ${card}`, detail:`Waiting for ${drawer} to draw.`, card, buys };
    return { kind:'buy', title:`Want the ${card}?`, detail:`${drawer} is drawing. Choose buy or pass.`, card, buys };
  }
  const receipt = game.buyReceipt;
  if (receipt) {
    const bought = label(receipt.card);
    const buyer = game.players.find(p => p.id === receipt.buyerId)?.name || 'Another player';
    const titles = { bought:`Bought ${bought} + one extra card`, 'not-bought':`${buyer} bought ${bought} first in turn order`, passed:`Passed on ${bought}`, taken:`${buyer} took ${bought}. Your buy was not used.`, expired:`The choice for ${bought} has closed.` };
    if (titles[receipt.outcome]) return { kind:'receipt', title:titles[receipt.outcome], detail:`${drawer}’s turn.` };
  }
  return { kind:'waiting', title:`${drawer}’s turn`, detail:buys === 0 ? 'No buys left this round. They reset next round.' : game.buyDecisionClosed ? 'Buying is closed for this discard.' : 'Your hand is ready to sort while you wait.' };
}
