import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionView } from './decision.js';
const card = {id:'heart8',rank:'8',suit:'H'};
function fixture(changes={}) { return {phase:'playing',currentPlayerId:'riley',turnPhase:'draw',discardTop:card,buyDecisionId:'decision1',buyDecisionClosed:false,buyRequests:[],buyPasses:[],players:[{id:'you',name:'You',buysUsed:0},{id:'riley',name:'Riley',buysUsed:0}],...changes}; }
const view = (game, changes={}) => decisionView({game,you:'you',role:'player',...changes});
test('a held deck draw has no second draw action',()=>{ const result=view(fixture({currentPlayerId:'you',pendingDraw:true,buyWindow:{waitingOn:['Riley']}})); assert.equal(result.kind,'held'); assert.match(result.detail,/Riley/); });
test('fresh mandatory choice outranks the last buy receipt',()=>{ assert.equal(view(fixture({buyReceipt:{outcome:'bought',card}})).kind,'buy'); });
test('buy request is conditional and pass remains a real decision',()=>{ const result=view(fixture({buyRequests:['you']})); assert.equal(result.kind,'requested');assert.match(result.detail,/first buyer clockwise/); assert.equal(view(fixture({buyPasses:['you']})).kind,'passed'); });
test('closed and exhausted windows do not request another choice',()=>{ assert.equal(view(fixture({buyDecisionClosed:true})).kind,'waiting'); assert.equal(view(fixture({players:[{id:'you',buysUsed:3},{id:'riley',name:'Riley'}]})).kind,'waiting'); });
test('only the swapped joker may be discarded until used',()=>{ const game=fixture({currentPlayerId:'you',turnPhase:'action',mustPlayJoker:'joker1'}); assert.equal(view(game,{selected:['heart8']}).canDiscard,false); assert.equal(view(game,{selected:['joker1']}).canDiscard,true); assert.equal(view(game,{selected:[]}).canDiscard,false); });
test('recovery and unconfirmed saves override all actions',()=>{ assert.equal(view(fixture(),{health:{connected:false}}).kind,'locked'); assert.equal(view(fixture(),{busy:true}).kind,'locked'); });
test('saved buy outcomes identify the actual recipient',()=>{ const result=view(fixture({turnPhase:'action',buyReceipt:{outcome:'not-bought',buyerId:'riley',card}})); assert.match(result.title,/Riley bought 8♥ first/); });
