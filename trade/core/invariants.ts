import type { Setup } from './types';
export type RiskRules={minStopPoints:number;maxStopPoints:number;targetR?:number};
export type LevelCandidate={direction:'BUY'|'SELL';entry:number;stop:number;target:number;rr:number};
export function validateLevels(c:LevelCandidate,tickSize:number,rules:RiskRules):string[]{
 const errors:string[]=[],sign=c.direction==='BUY'?1:-1;
 if(![c.entry,c.stop,c.target,tickSize,rules.minStopPoints,rules.maxStopPoints].every(n=>Number.isFinite(n)&&n>0)){return ['INVALID_PRICE: preços, tick size ou limites inválidos.'];}
 if(!['BUY','SELL'].includes(c.direction))errors.push('INVALID_DIRECTION');
 const risk=sign*(c.entry-c.stop),potential=sign*(c.target-c.entry);
 if(risk<=0)errors.push('INVALID_STOP_SIDE: stop técnico do lado errado da entrada.');
 if(potential<=0)errors.push('INVALID_TARGET_SIDE: alvo do lado errado da entrada.');
 if(risk<rules.minStopPoints||risk>rules.maxStopPoints)errors.push(`STOP_OUT_OF_BOUNDS: Stop técnico de ${risk} pontos fora dos limites ${rules.minStopPoints}–${rules.maxStopPoints} da estratégia.`);
 if(!Number.isFinite(c.rr)||c.rr<=0||Math.abs(potential/risk-c.rr)>1e-6||(rules.targetR!==undefined&&Math.abs(c.rr-rules.targetR)>1e-6))errors.push('INCONSISTENT_RR: relação risco/retorno inconsistente.');
 if([c.entry,c.stop,c.target].some(n=>Math.abs(n/tickSize-Math.round(n/tickSize))>1e-6))errors.push('OFF_TICK_PRICE: preço não respeita o tick do instrumento.');
 return errors;
}
export function validateSetup(s:Setup,tickSize:number,rules:RiskRules):string[]{
 const errors=validateLevels({direction:s.direction==='long'?'BUY':'SELL',entry:s.entry,stop:s.stop,target:s.targets[0],rr:s.rr},tickSize,rules);
 const sign=s.direction==='long'?1:-1;
 if(Math.abs(s.riskPoints-sign*(s.entry-s.stop))>1e-6||Math.abs(s.potentialPoints-sign*(s.targets[0]-s.entry))>1e-6)errors.push('INCONSISTENT_RISK: distâncias declaradas divergentes dos preços.');
 if(s.conditions.some(c=>!c.met)||s.conflicts.length)errors.push('INCOMPLETE_CONDITIONS');
 return errors;
}
