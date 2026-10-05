import { remainingPositionRiskBRL } from './risk-engine';

export type PositionExitReason='STOP'|'TARGET'|'TRAILING'|'BREAKEVEN'|'PARTIAL'|'TECHNICAL'|'TIME'|'MANUAL'|'RISK';
export type TrailingMode='NONE'|'STRUCTURE'|'R_BASED'|'ATR'|'FIXED_DISTANCE';
export type ManagedPosition={
 id:string; direction:'long'|'short'; entry:number; initialStop:number; stop:number; target:number; initialQuantity:number; openQuantity:number; pointValue:number; initialRiskBRL:number; realizedPnLBRL:number; realizedR:number; mfePoints:number; maePoints:number; trailingMode:TrailingMode; breakevenProtected:boolean; events:PositionEvent[];
};
export type PositionEvent={at:number;type:'OPEN'|'STOP_MOVED'|'PARTIAL'|'CLOSED';price:number;quantity?:number;reason?:PositionExitReason;note?:string};

export function createManagedPosition(input:Omit<ManagedPosition,'realizedPnLBRL'|'realizedR'|'mfePoints'|'maePoints'|'breakevenProtected'|'events'>,at:number):ManagedPosition{
 if(input.initialQuantity<=0||input.openQuantity<=0||input.openQuantity>input.initialQuantity||input.initialRiskBRL<=0)throw new Error('INVALID_POSITION');
 return {...input,realizedPnLBRL:0,realizedR:0,mfePoints:0,maePoints:0,breakevenProtected:false,events:[{at,type:'OPEN',price:input.entry,quantity:input.openQuantity}]};
}
export function markExcursion(p:ManagedPosition,high:number,low:number){
 const favorable=p.direction==='long'?high-p.entry:p.entry-low, adverse=p.direction==='long'?p.entry-low:high-p.entry;
 p.mfePoints=Math.max(p.mfePoints,favorable);p.maePoints=Math.max(p.maePoints,adverse);return p;
}
export function moveStop(p:ManagedPosition,nextStop:number,at:number,note?:string){
 if(!Number.isFinite(nextStop))throw new Error('INVALID_STOP');
 const loosens=p.direction==='long'?nextStop<p.stop:nextStop>p.stop;
 if(loosens)throw new Error('STOP_CANNOT_LOOSEN');
 if(p.direction==='long'&&nextStop>=p.target)throw new Error('STOP_CROSSES_TARGET');
 if(p.direction==='short'&&nextStop<=p.target)throw new Error('STOP_CROSSES_TARGET');
 p.stop=nextStop;p.breakevenProtected=p.direction==='long'?nextStop>=p.entry:nextStop<=p.entry;
 p.events.push({at,type:'STOP_MOVED',price:nextStop,note});return p;
}
export function partialExit(p:ManagedPosition,quantity:number,price:number,at:number,reason:PositionExitReason='PARTIAL'){
 if(quantity<=0||quantity>p.openQuantity)throw new Error('INVALID_PARTIAL_QUANTITY');
 const sign=p.direction==='long'?1:-1, pnl=sign*(price-p.entry)*quantity*p.pointValue;
 p.openQuantity-=quantity;p.realizedPnLBRL+=pnl;p.realizedR=p.realizedPnLBRL/p.initialRiskBRL;
 p.events.push({at,type:p.openQuantity===0?'CLOSED':'PARTIAL',price,quantity,reason});return p;
}
export function closePosition(p:ManagedPosition,price:number,at:number,reason:PositionExitReason){return partialExit(p,p.openQuantity,price,at,reason);}
export function openRiskBRL(p:ManagedPosition){return remainingPositionRiskBRL(p.direction,p.entry,p.stop,p.openQuantity,p.pointValue);}
export function protectedProfitBRL(p:ManagedPosition){
 const sign=p.direction==='long'?1:-1;return Math.max(0,sign*(p.stop-p.entry)*p.openQuantity*p.pointValue)+p.realizedPnLBRL;
}
