import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { feedStatus } from '../../trade/bridge/mt5';
test('source timezone converts server-labelled epochs once; UTC, BRT, midnight and ms preserve the instant', async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  await db.exec(readFileSync('supabase/migrations/20261003035402_mt5_bridge.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261005122031_bridge_market_clock.sql','utf8'));
  const convert=async(ms:number,zone:string)=>(await db.query<any>('select public.trade_bridge_market_epoch($1,$2) as ms',[ms,zone])).rows[0].ms;
  for(const utc of [Date.parse('2026-10-05T12:15:00.531Z'),Date.parse('2026-10-06T01:00:00.123Z')]) {
   assert.equal(Number(await convert(utc,'UTC')),utc);
   assert.equal(Number(await convert(utc-10800000,'America/Sao_Paulo')),utc);
   for(const age of [1000,10000,16000]) {
    const now=utc+age;
    const data={tick:{symbol:'WINV26',timeMsc:Number(await convert(utc-10800000,'America/Sao_Paulo'))},state:{connected:true,executionAllowed:false},receivedAt:new Date(now).toISOString(),killSwitch:true};
    for(const timezone of ['UTC','America/Sao_Paulo','Asia/Tokyo']) {
     const previous=process.env.TZ;process.env.TZ=timezone;
     try {const feed=feedStatus(data,{TRADE_EXECUTION_ENABLED:'false'},now);assert.equal(feed.ageMs,age);assert.equal(feed.status,age<=15000?'LIVE':'STALE');assert.equal(feed.executionEnabled,false);}
     finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
    }
   }
  }
  const raw=1791191700531,now=1791202507157;
  assert.equal(now-raw,10806626);
  assert.equal(now-Number(await convert(raw,'America/Sao_Paulo')),6626);
  await db.query("insert into public.trade_bridge_state(bridge_id,symbol,session,account_hash,state,tick)values('xp-mt5-primary','WINV26','test','test',$1,$2)",[{connected:true,executionAllowed:false},{symbol:'WINV26',timeMsc:raw}]);
  const read=(await db.query<any>("select public.trade_bridge_read('xp-mt5-primary') as data")).rows[0].data;
  assert.equal(read.tick.rawTimeMsc,raw);assert.equal(read.tick.timeMsc,raw+10800000);
  assert.equal(read.killSwitch,true);
  assert.equal((await db.query<any>('select tick from public.trade_bridge_state')).rows[0].tick.timeMsc,raw);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from public.trade_bridge_clock_settings'),/permission denied/);
 }finally{await db.close();}
});
test('EA classifies empty, HTML, JSON unknown and text responses without logging response secrets',()=>{
 const ea=readFileSync('mt5/FocoTradeBridge.mq5','utf8');
 for(const shape of ['BRIDGE_RESPONSE_EMPTY','BRIDGE_RESPONSE_HTML','BRIDGE_RESPONSE_JSON_UNKNOWN','BRIDGE_RESPONSE_TEXT'])assert.ok(ea.includes(shape));
 assert.ok(ea.includes('TimeTradeServer()-(long)TimeGMT()'));
 assert.ok(ea.includes('EnableExecution=false'));
 assert.ok(!ea.includes('Print(reply'));
});
test('producer/configured clock disagreement blocks feed instead of shifting a tick by its apparent age',()=>{
 const now=Date.now();const data={tick:{symbol:'WINV26',rawTimeMsc:now-10800000,timeMsc:now},receivedAt:new Date(now).toISOString(),state:{connected:true,marketClock:{utcOffsetSeconds:0}}};
 assert.equal(feedStatus(data,{},now).status,'OFFLINE');
 assert.equal(feedStatus({...data,state:{...data.state,marketClock:{utcOffsetSeconds:-10800}}},{},now).status,'LIVE');
});
