'use client';
import type {Trip,TripMoment,TripMomentItem,TripPackingItem} from './travelStore';

type Piece={id:string;name:string;category:string;color?:string|null;subcategory?:string|null;image?:string;metadata?:Record<string,any>};
export type PackingInsight={item:Piece;uses:number;moments:string[];priority:'essential'|'high'|'normal';packed:boolean;reason:string};
export type TripRadar={score:number;label:string;readyLooks:number;totalMoments:number;packed:number;packingTotal:number;weatherKnown:number;weatherReview:number;alerts:{tone:'critical'|'attention'|'ok';title:string;detail:string;action?:'route'|'looks'|'packing'|'market'}[]};
const id=(v:any)=>String(v??'');

export function buildSmartPacking(moments:TripMoment[],links:TripMomentItem[],packing:TripPackingItem[],closet:Piece[],packingMode:'compact'|'balanced'|'variety'='balanced'):PackingInsight[]{
 const itemMap=new Map(closet.map(x=>[id(x.id),x]));
 const packedRows=new Map(packing.map(x=>[id(x.item_id),x]));
 const momentMap=new Map(moments.map(x=>[id(x.id),x]));
 const use=new Map<string,{uses:number;moments:string[]}>();
 for(const l of links){
  const k=id(l.item_id),m=momentMap.get(id(l.moment_id)),p=use.get(k)||{uses:0,moments:[]};
  p.uses++;
  if(m&&!p.moments.includes(m.title))p.moments.push(m.title);
  use.set(k,p);
 }
 for(const row of packing){const k=id(row.item_id);if(!use.has(k))use.set(k,{uses:0,moments:[]})}
 return [...use.entries()].map(([itemId,u])=>{
  const item=itemMap.get(itemId);
  if(!item)return null;
  const row=packedRows.get(itemId);
  const category=`${item.category} ${item.subcategory||''}`.toLowerCase();
  const outer=/casaco|jaqueta|sobretudo|puffer|parka/.test(category);
  const shoe=/calçado|sapato|tênis|bota/.test(category);
  const multi=u.uses>1;
  const compactBoost=packingMode==='compact'&&multi;
  const purchased=Boolean(row?.purchased_for_trip);
  const essential=purchased||((outer||shoe)&&multi)||u.uses>=3||compactBoost;
  const priority:PackingInsight['priority']=essential?'essential':u.uses===2?'high':'normal';
  const reason=purchased&&u.uses===0?'Compra para esta viagem · pronta para entrar em um look':u.uses>1?`${u.uses} momentos usam esta peça${packingMode==='compact'?' · ótima para mala compacta':''}`:u.uses===1?'Peça dedicada a um momento':'Peça adicionada ao planejamento da mala';
  return {item,uses:u.uses,moments:u.moments,priority,packed:Boolean(row?.packed),reason};
 }).filter((x):x is PackingInsight=>Boolean(x)).sort((a,b)=>({essential:3,high:2,normal:1}[b.priority]-{essential:3,high:2,normal:1}[a.priority])||b.uses-a.uses||a.item.name.localeCompare(b.item.name));
}

export function buildTripRadar(trip:Trip,moments:TripMoment[],links:TripMomentItem[],packing:TripPackingItem[],thermalProblemMomentIds:string[]=[],weatherReviewIds:string[]=[]):TripRadar{
 const momentsWithLook=new Set(links.map(x=>id(x.moment_id)));
 const readyLooks=moments.filter(x=>momentsWithLook.has(id(x.id))).length,totalMoments=moments.length;
 const packed=packing.filter(x=>x.packed).length,packingTotal=packing.length;
 const weatherKnown=moments.filter(x=>x.expected_temp_min!=null||x.expected_temp_max!=null).length;
 const weatherReview=weatherReviewIds.length||moments.filter(x=>Boolean(x.metadata?.weather_review_needed)).length;
 const lookPct=totalMoments?readyLooks/totalMoments:0,packPct=packingTotal?packed/packingTotal:(readyLooks?0.35:0),weatherPct=totalMoments?weatherKnown/totalMoments:0;
 let score=Math.round((lookPct*.5+packPct*.3+weatherPct*.2)*100);
 if(thermalProblemMomentIds.length)score-=Math.min(20,thermalProblemMomentIds.length*7);
 if(weatherReview)score-=Math.min(12,weatherReview*4);
 score=Math.max(0,Math.min(100,score));
 const alerts:TripRadar['alerts']=[];
 if(!totalMoments)alerts.push({tone:'attention',title:'Roteiro ainda vazio',detail:'Adicione os momentos da viagem para eu planejar looks e mala.',action:'route'});
 else if(readyLooks<totalMoments)alerts.push({tone:'attention',title:`Faltam ${totalMoments-readyLooks} ${totalMoments-readyLooks===1?'look':'looks'}`,detail:'Há momentos do roteiro que ainda não têm combinação definida.',action:'route'});
 if(weatherReview)alerts.push({tone:'critical',title:`${weatherReview} ${weatherReview===1?'look pede':'looks pedem'} revisão`,detail:'A previsão mudou desde quando você planejou. Reavalie antes de fechar a mala.',action:'looks'});
 if(thermalProblemMomentIds.length)alerts.push({tone:'critical',title:'Há lacunas de proteção',detail:`${thermalProblemMomentIds.length} ${thermalProblemMomentIds.length===1?'momento precisa':'momentos precisam'} de peças mais adequadas ao clima. Vou tentar resolver com seu closet antes de indicar compras.`,action:'market'});
 if(packingTotal&&packed<packingTotal)alerts.push({tone:'attention',title:`Mala ${Math.round(packPct*100)}% separada`,detail:`Ainda faltam ${packingTotal-packed} ${packingTotal-packed===1?'peça':'peças'} do planejamento.`,action:'packing'});
 if(totalMoments&&weatherKnown<totalMoments)alerts.push({tone:'attention',title:'Clima ainda incompleto',detail:`${totalMoments-weatherKnown} ${totalMoments-weatherKnown===1?'momento ainda não tem':'momentos ainda não têm'} contexto climático disponível.`});
 if(totalMoments&&readyLooks===totalMoments&&(!packingTotal||packed===packingTotal)&&!thermalProblemMomentIds.length&&!weatherReview)alerts.push({tone:'ok',title:'Viagem preparada',detail:'Seus momentos estão com looks definidos, mala organizada e sem alertas importantes agora.'});
 return {score,label:score>=90?'Pronta para viajar':score>=75?'Quase tudo pronto':score>=55?'Bom progresso':score>=30?'Em preparação':'Começando agora',readyLooks,totalMoments,packed,packingTotal,weatherKnown,weatherReview,alerts};
}
