import type { Candle, MarketSnapshot, Timeframe } from './types';
import { timeframeSeconds } from './providers';
/** Versioned safety policy: execution structure never crosses a session or a missing bucket. */
export const structurePolicy = Object.freeze({ version:'1.1.0', timezone:'America/Sao_Paulo', maxClosedBarAgeSeconds:120, allowCrossSession:false });
const sessionFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:structurePolicy.timezone,year:'numeric',month:'2-digit',day:'2-digit'});
const sessionKeys=new Map<number,string>();
export function sessionKey(epochSeconds:number){
 const minute=Math.floor(epochSeconds/60);
 let value=sessionKeys.get(minute);
 if(!value){value=sessionFormatter.format(new Date(epochSeconds*1000));if(sessionKeys.size>16000)sessionKeys.clear();sessionKeys.set(minute,value);}
 return value;
}
export function currentStructure(candles:Candle[],asOf:number,tf:Timeframe,symbol:string):Candle[]{
 const step=timeframeSeconds[tf],key=sessionKey(asOf-1);
 const valid=candles.filter(c=>c.symbol===symbol&&c.timeframe===tf&&c.timestamp+step<=asOf&&sessionKey(c.timestamp)===key);
 if(!valid.length||asOf-(valid.at(-1)!.timestamp+step)>=step)return [];
 let start=valid.length-1;
 while(start>0&&valid[start].timestamp-valid[start-1].timestamp===step)start--;
 return valid.slice(start);
}
/** Chart history stays intact; only the decision view is narrowed. Replay has the same contract. */
export function decisionSnapshot(s:MarketSnapshot):MarketSnapshot {
 return {...s,candles:Object.fromEntries(Object.entries(s.candles).map(([tf,cs])=>[tf,currentStructure(cs,s.asOf,tf as Timeframe,s.symbol)])) as MarketSnapshot['candles']};
}
