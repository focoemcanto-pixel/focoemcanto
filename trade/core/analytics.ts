export type TradeObservation={resultR:number;strategyId?:string;strategyVersion?:string;mfeR?:number;maeR?:number;durationMinutes?:number;costR?:number;environment?:'BACKTEST'|'REPLAY'|'PAPER'|'REAL'};
export type StrategyAnalytics={sampleSize:number;wins:number;losses:number;winRate:number;avgWinR:number;avgLossR:number;expectancyR:number;netR:number;maxDrawdownR:number;currentDrawdownR:number;currentLossStreak:number;maxLossStreak:number;avgMfeR:number|null;avgMaeR:number|null;confidence:'INSUFFICIENT_DATA'|'RESEARCH'|'PAPER_EVIDENCE'};
const avg=(a:number[])=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
export function analyzeTrades(trades:TradeObservation[]):StrategyAnalytics{
 const r=trades.map(t=>t.resultR-(t.costR||0)),wins=r.filter(x=>x>0),losses=r.filter(x=>x<0);
 let equity=0,peak=0,maxDd=0,streak=0,maxStreak=0;
 for(const x of r){equity+=x;peak=Math.max(peak,equity);maxDd=Math.max(maxDd,peak-equity);if(x<0){streak++;maxStreak=Math.max(maxStreak,streak);}else streak=0;}
 const avgWin=avg(wins),avgLoss=losses.length?Math.abs(avg(losses)):0,winRate=r.length?wins.length/r.length:0;
 const mfe=trades.flatMap(t=>t.mfeR===undefined?[]:[t.mfeR]),mae=trades.flatMap(t=>t.maeR===undefined?[]:[t.maeR]);
 return {sampleSize:r.length,wins:wins.length,losses:losses.length,winRate,avgWinR:avgWin,avgLossR:avgLoss,expectancyR:winRate*avgWin-(1-winRate)*avgLoss,netR:equity,maxDrawdownR:maxDd,currentDrawdownR:peak-equity,currentLossStreak:streak,maxLossStreak:maxStreak,avgMfeR:mfe.length?avg(mfe):null,avgMaeR:mae.length?avg(mae):null,confidence:r.length<30?'INSUFFICIENT_DATA':r.length<100?'RESEARCH':'PAPER_EVIDENCE'};
}
export function groupByEnvironment(trades:TradeObservation[]){
 const groups=new Map<string,TradeObservation[]>();for(const t of trades){const k=t.environment||'UNKNOWN';groups.set(k,[...(groups.get(k)||[]),t]);}return Object.fromEntries([...groups].map(([k,v])=>[k,analyzeTrades(v)]));
}
