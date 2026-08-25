import type { StylistPiece } from './lookEngine';
import type { SavedLook, WearHistory } from './savedLooks';
import { buildWearHistory } from './savedLooks';

export type RotationPiece=StylistPiece&{rotationPenalty?:number;lastWornAt?:string;wearCount?:number};

function daysSince(iso?:string){if(!iso)return Infinity;const ms=Date.now()-new Date(iso).getTime();return Math.max(0,ms/86400000)}

export function rotationPenalty(itemId:string|number,history:WearHistory){
 const id=String(itemId),days=daysSince(history.lastWornByItem[id]),count=history.wearCountByItem[id]||0;
 let penalty=0;
 if(days<1)penalty+=24;
 else if(days<3)penalty+=16;
 else if(days<7)penalty+=9;
 else if(days<14)penalty+=4;
 penalty+=Math.min(6,Math.max(0,count-2)*.7);
 return Math.round(penalty*10)/10;
}

export function enrichWithRotation<T extends StylistPiece>(pieces:T[],looks:SavedLook[]):(T&RotationPiece)[]{
 const history=buildWearHistory(looks);
 return pieces.map(p=>({...p,rotationPenalty:rotationPenalty(p.id,history),lastWornAt:history.lastWornByItem[String(p.id)],wearCount:history.wearCountByItem[String(p.id)]||0}));
}

export function freshWardrobe<T extends RotationPiece>(pieces:T[],minimumPerEssentialCategory=1){
 const essential=['Blusas','Calças','Calçados'];
 const fresh=pieces.filter(p=>(p.rotationPenalty||0)<16);
 const viable=essential.every(category=>fresh.filter(p=>p.category===category).length>=minimumPerEssentialCategory);
 return viable?fresh:pieces;
}

export function repeatedLookPenalty(items:StylistPiece[],looks:SavedLook[]){
 const history=buildWearHistory(looks),signature=items.map(p=>String(p.id)).sort().join('|');
 const index=history.recentLookSignatures.indexOf(signature);
 if(index<0)return 0;
 return Math.max(5,28-index*2);
}

export function rotationSummary<T extends RotationPiece>(pieces:T[]){
 const wornRecently=pieces.filter(p=>(p.rotationPenalty||0)>=9).length;
 const forgotten=pieces.filter(p=>!p.lastWornAt||daysSince(p.lastWornAt)>=30).length;
 return {wornRecently,forgotten,total:pieces.length};
}
