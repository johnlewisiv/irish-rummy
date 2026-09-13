import React from 'react';
import { decisionView } from './decision.js';
import { cardLabel } from './Card.jsx';

export default function DecisionDock({ game, you, role, health, busy, selected, act, now, onStage, onDiscard, autoPass, onDisableAutoPass, staging }) {
  const view = decisionView({ game, you, role, health, busy, selected });
  const win = game.buyWindow;
  const timer = win && !win.untimed && !game.buyDecisionClosed && role === 'player';
  const seconds = Math.max(0, Math.ceil((win?.expiresAt - now) / 1000));
  const hand = game.players.find(p => p.id === you)?.hand || [];
  const selectedCard = selected.length === 1 ? hand.find(c => c.id === selected[0]) : null;
  return <section className={`decision-dock decision-${view.kind}`} aria-label="Your next action" aria-busy={!!busy}>
    <div className="decision-heading"><h2 aria-live="polite">{view.title}</h2>{timer && <div className="decision-timer"><span>{win.paused ? 'Paused' : `${seconds}s`}</span><button disabled={view.kind === 'locked'} onClick={() => act(win.paused ? 'game:resumeBuy' : 'game:pauseBuy')}>{win.paused ? 'Resume' : 'Pause'}</button></div>}</div>
    <p>{view.detail}</p>
    {view.kind === 'draw' && <div className="decision-actions"><button className="primary-button" onClick={() => act('game:draw', {from:'deck'})}>Draw from deck</button><button className="outline-button" disabled={!game.discardTop} onClick={() => act('game:draw', {from:'discard'})}>Take {view.card}</button></div>}
    {view.kind === 'buy' && <><div className="decision-actions"><button className="primary-button" onClick={() => act('game:buy')}>Buy {view.card}</button><button className="outline-button" onClick={() => act('game:pass')}>Pass</button></div><small>Buying adds one extra card · {view.buys} buys left</small></>}
    {view.kind === 'requested' && <button className="outline-button" onClick={() => act('game:pass')}>Pass instead</button>}
    {view.kind === 'passed' && <button className="text-button" onClick={() => act('game:buy')}>Request to buy instead</button>}
    {view.kind === 'action' && !staging && <div className="decision-actions">{view.canStage && <button className={game.canGoDownHint ? 'primary-button' : 'outline-button'} onClick={onStage}>Go down{game.canGoDownHint ? ' · Ready' : ''}</button>}<button className={game.canGoDownHint && view.canStage ? 'outline-button' : 'primary-button'} disabled={!view.canDiscard} onClick={onDiscard}>Discard{selectedCard ? ` ${cardLabel(selectedCard)}` : ''}</button></div>}
    {autoPass && ['passed','buy','requested'].includes(view.kind) && <small>Auto-pass is on · <button className="text-button" onClick={onDisableAutoPass}>Turn off</button></small>}
  </section>;
}
