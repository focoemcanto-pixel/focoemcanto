import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLevels} from '../../trade/core/invariants';
import {decisionSnapshot,currentStructure} from '../../trade/core/market-context';
import {snapshotOf,generateMockCandles} from '../../trade/core/providers';
import {TrendPullbackConfirmation} from '../../trade/core/strategy';
import {scanMarket} from '../../trade/scanner/engine';
const limits={minStopPoints:20,maxStopPoints:650,targetR:2};
const good={direction:'BUY' as const,entry:208250,stop:208150,target:208450,rr:2};
for(const [name,value] of Object.entries({stopAbove:{stop:208350},targetWrong:{target:208050},stopZero:{stop:0},stopNegative:{stop:-5},maxStop:{stop:193020,target:238710},minStop:{stop:208245,target:208260},rr:{rr:3},offTick:{entry:208251}}))test(`central invariant rejects ${name}`,()=>assert.ok(validateLevels({...good,...value},5,limits).length));
test('SELL order geometry is validated identically',()=>{assert.deepEqual(validateLevels({direction:'SELL',entry:208250,stop:208350,target:208050,rr:2},5,limits),[]);assert.ok(validateLevels({direction:'SELL',entry:208250,stop:208150,target:208450,rr:2},5,limits).length);});
test('production 193k Friday structure cannot become a stop for Monday 208k; no phantom higher timeframe buckets',()=>{
 const old=generateMockCandles(300).map((c,i)=>({...c,symbol:'WINV26',timestamp:Date.parse('2026-10-02T13:00:00Z')/1000+i*60,open:193250,close:193250,low:193000,high:193500}));
 const today=old.slice(0,35).map((c,i)=>({...c,timestamp:Date.parse('2026-10-05T12:00:00Z')/1000+i*60,open:208250,close:208250,low:208200,high:208350}));
 const snapshot=snapshotOf([...old,...today],'live'),decision=decisionSnapshot(snapshot),a=new TrendPullbackConfirmation().evaluate(snapshot);
 assert.ok(snapshot.candles['5m'].some(c=>c.low===193000));
 assert.ok(decision.candles['5m'].every(c=>c.low===208200));
 assert.equal(a.projected,undefined);assert.equal(a.setup,undefined);
 // Rules may now evaluate today's M1 structure, but no level may come from Friday's 193k session.
 const levels=scanMarket(snapshot).candidates.flatMap(c=>[c.analysis.setup?.stop,c.analysis.setup?.entry,c.projected?.stop,c.projected?.entry,c.analysis.support,c.analysis.resistance]).filter((v):v is number=>v!==undefined);
 assert.ok(levels.length>0);
 assert.ok(levels.every(v=>v>=208000),JSON.stringify(levels));
 const gap=today.filter((_,i)=>i!==30);const s=snapshotOf(gap,'live');
 assert.equal(currentStructure(s.candles['1m'],s.asOf,'1m','WINV26').length,4);
 assert.equal(currentStructure(s.candles['5m'],s.asOf,'5m','WINV26').length,0);
 assert.equal(currentStructure(s.candles['1m'],s.asOf,'1m','WINZ26').length,0);
 assert.equal(currentStructure(snapshot.candles['1m'],snapshot.asOf+3600,'1m','WINV26').length,0);
});
