'use client';
import type {Trip,TripMoment,TripMomentItem,TripPackingItem} from './travelStore';

type Piece={id:string;name:string;category:string;color?:string|null;subcategory?:string|null;metadata?:Record<string,any>};
export type PackingInsight={item:Piece;uses:number;moments:string[];priority:'essential'|'high'|'normal';packed:boolean;reason:string};
export type TripRadar={score:number;label:string;readyLooks:number;totalMoments:number;packed:number;packingTotal:number;weatherKnown:number;alerts:{tone:'critical'|'attention'|'ok';title:string;detail:string;action?:'route'|'looks'|'packing'|'market'}[]};

const id=(v:any)=>String(v??'');
export function buildSmartPacking(moments:TripMoment[],links:TripMomentItem[],packing:TripPackingItem[],closet:Piece[]):PackingInsight[]{
 const itemMap=new Map(closet.map(x=>[id(x.id),x])),packed=new Map(packing.map(x=>[id(x.item_id),Boolean(x.packed)])),momentMap=new Map(moments.map(x=>[id(x.id),x]));
 const use=new Map<string,{uses:number;moments:string[]}>();
 for(const l of links){const k=id(l.item_id),m=momentMap.get(id(l.moment_id)),p=use.get(k)||{uses:0,moments:[]};p.uses++;if(m&&!p.moments.includes(m.title))p.moments.push(m.title);use.set(k,p)}
 return [...use.entries()].map(([itemId,u])=>{const item=itemMap.get(itemId);if(!item)return null;const category=`${item.category} ${item.subcategory||''}`.toLowerCase(),essential=/casaco|jaqueta|calçado|sapato|tênis|bota/.test(category)&&u.uses>1,priority: PackingInsight['priority']=u.uses>=3||essential?'essential':u.uses===2?'high':'normal';return{item,uses:u.uses,moments:u.moments,priority,packed:packed.get(itemId)||false,reason:u.uses>1?`Resolve ${u.uses} momentos da viagem`:'Peça dedicada a um momento'}}).filter(Boolean).sort((a:any,b:any)=>({essential:3,high:2,normal:1}[b.priority]-{essential:3,high:2,normal:1}[a.priority]||b.uses-a.uses) as PackingInsight[];
}

export function buildTripRadar(trip:Trip,moments:TripMoment[],links:TripMomentItem[],packing:TripPackingItem[],thermalProblemMomentIds:string[]=[]):TripRadar{
 const momentsWithLook=new Set(links.map(x=>id(x.moment_id))),readyLooks=moments.filter(x=>momentsWithLook.has(id(x.id))).length,totalMoments=moments.length,packed=packing.filter(x=>x.packed).length,packingTotal=packing.length,weatherKnown=moments.filter(x=>x.expected_temp_min!=null||x.expected_temp_max!=null).length;
 const lookPct=totalMoments?readyLooks/totalMoments:0,packPct=packingTotal?packed/packingTotal:(readyLooks?0.35:0),weatherPct=totalMoments?weatherKnown/totalMoments:0;
 let score=Math.round((lookPct*.5+packPct*.3+weatherPct*.2)*100);if(thermalProblemMomentIds.length)score=Math.max(0,score-Math.min(20,thermalProblemMomentIds.length*7));
 const alerts:TripRadar['alerts']=[];
 if(!totalMoments)alerts.push({tone:'attention',title:'Roteiro ainda vazio',detail:'Adicione os momentos da viagem para eu planejar looks e mala.',action:'route'});
 else if(readyLooks<totalMoments)alerts.push({tone:'attention',title:`Faltam ${totalMoments-readyLooks} ${totalMoments-readyLooks===1?'look':'looks'}`,detail:'Há momentos do roteiro que ainda não têm combinação definida.',action:'route'});
 if(thermalProblemMomentIds.length)alerts.push({tone:'critical',title:'Há lacunas de proteção',detail:`${thermalProblemMomentIds.length} ${thermalProblemMomentIds.length===1?'momento precisa':'momentos precisam'} de peças mais adequadas ao clima. Vou tentar resolver com seu closet antes de indicar compras.`,action:'market'});
 if(packingTotal&&packed<packingTotal)alerts.push({tone:'attention',title:`Mala ${Math.round(packPct*100)}% separada`,detail:`Ainda faltam ${packingTotal-packed} ${packingTotal-packed===1?'peça':'peças'} do planejamento.`,action:'packing'});
 if(totalMoments&&weatherKnown<totalMoments)alerts.push({tone:'attention',title:'Clima ainda incompleto',detail:`${totalMoments-weatherKnown} ${totalMoments-weatherKnown===1?'momento ainda não tem':'momentos ainda não têm'} contexto climático disponível.`});
 if(totalMoments&&readyLooks===totalMoments&&(!packingTotal||packed===packingTotal)&&!thermalProblemMomentIds.length)alerts.push({tone:'ok',title:'Viagem preparada',detail:'Seus momentos estão com looks definidos e não encontrei lacunas importantes agora.'});
 return{score,label:score>=85?'Quase tudo pronto':score>=60?'Bom progresso':score>=35?'Em preparação':'Começando agora',readyLooks,totalMoments,packed,packingTotal,weatherKnown,alerts};
}
