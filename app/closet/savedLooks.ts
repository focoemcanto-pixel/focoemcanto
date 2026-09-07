'use client';

import type { ClosetSession } from './supabase';

export type SavedLookContext={occasion?:string;detail?:string;period?:string;colors?:string[];paletteMode?:string;work_profile?:Record<string,any>|null;weather?:Record<string,any>|null;thermal_sensitivity?:number;source?:'stylist'|'manual'|'travel'|string;engine?:string;tags?:string[];saved_at?:string;[key:string]:any};
export type SavedLook={
 id:string;user_id:string;occasion:string;title?:string|null;item_ids:string[];favorite:boolean;rating?:string|null;worn_count:number;last_worn_at?:string|null;notes?:string|null;created_at?:string;updated_at?:string;stylist_context?:SavedLookContext|null;
};
export type WearHistory={lastWornByItem:Record<string,string>;wearCountByItem:Record<string,number>;recentLookSignatures:string[]};

const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
const CONTEXT_PREFIX='[closet-context-v3]';
function headers(token:string,extra:Record<string,string>={}){return {apikey:anon,Authorization:`Bearer ${token}`,...extra}}
function friendly(raw:any){const msg=String(raw?.message||raw?.error||raw||'');if(/closet_saved_looks|schema cache|could not find the table/i.test(msg))return 'A biblioteca de looks ainda não foi ativada no Supabase.';return msg||'Não consegui acessar seus looks salvos.'}
async function readJson(r:Response){const t=await r.text();let data:any=null;try{data=t?JSON.parse(t):null}catch{data=t}if(!r.ok)throw new Error(friendly(data));return data}
function currentContext(occasion:string,source='stylist'):SavedLookContext{let c:any={};if(typeof window!=='undefined'){try{c=JSON.parse(sessionStorage.getItem('closet_stylist_context')||'{}')||{}}catch{}}const tags=[occasion,c.detail,c.work_profile?.dress_code,...(Array.isArray(c.colors)?c.colors:[])].filter(Boolean).map(String);return {...c,occasion:c.occasion||occasion,source:c.source||source,engine:'stylist-v3',tags:[...new Set(tags)],saved_at:new Date().toISOString()}}
function encodeNotes(userNotes:string|undefined,context:SavedLookContext){return `${CONTEXT_PREFIX}${JSON.stringify({context,user_notes:userNotes||null})}`}
function decodeNotes(raw:string|null|undefined){if(!raw||!raw.startsWith(CONTEXT_PREFIX))return {context:null,userNotes:raw||null};try{const data=JSON.parse(raw.slice(CONTEXT_PREFIX.length));return {context:data?.context||null,userNotes:data?.user_notes||null}}catch{return {context:null,userNotes:raw}}}
function hydrate(row:any):SavedLook{const decoded=decodeNotes(row?.notes);return {...row,notes:decoded.userNotes,stylist_context:decoded.context} as SavedLook}

export async function saveLook(session:ClosetSession,input:{occasion:string;itemIds:string[];title?:string;rating?:string;notes?:string;context?:SavedLookContext;tags?:string[];source?:string}){
 const context={...(input.context||currentContext(input.occasion,input.source||'stylist'))};if(input.tags?.length)context.tags=[...new Set([...(context.tags||[]),...input.tags])];
 const generatedSource=['stylist','manual','travel'].includes(String(input.source||context.source||''));
 const safeRating=generatedSource&&input.rating==='love'?'saved':(input.rating||'saved');
 const payload={user_id:session.user.id,occasion:input.occasion,title:input.title||`Look para ${input.occasion}`,item_ids:input.itemIds,favorite:true,rating:safeRating,notes:encodeNotes(input.notes,context),worn_count:0};
 const r=await fetch(`${url}/rest/v1/closet_saved_looks`,{method:'POST',headers:headers(session.access_token,{'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify(payload)});
 const rows=await readJson(r);return hydrate(rows?.[0]);
}

export async function loadSavedLooks(session:ClosetSession){
 const r=await fetch(`${url}/rest/v1/closet_saved_looks?select=*&order=created_at.desc`,{headers:headers(session.access_token)});
 const rows=await readJson(r) as any[];return (rows||[]).map(hydrate);
}

export async function updateLookTags(session:ClosetSession,look:SavedLook,tags:string[]){
 const context={...(look.stylist_context||{occasion:look.occasion,engine:'stylist-v3'}),tags:[...new Set([look.occasion,...tags].filter(Boolean))],updated_at:new Date().toISOString()};
 const body={notes:encodeNotes(look.notes||undefined,context),updated_at:new Date().toISOString()};
 const r=await fetch(`${url}/rest/v1/closet_saved_looks?id=eq.${encodeURIComponent(look.id)}`,{method:'PATCH',headers:headers(session.access_token,{'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify(body)});
 const rows=await readJson(r);return hydrate(rows?.[0]);
}

export function buildWearHistory(looks:SavedLook[]):WearHistory{
 const lastWornByItem:Record<string,string>={},wearCountByItem:Record<string,number>={},recentLookSignatures:string[]=[];
 const worn=looks.filter(x=>x.last_worn_at||Number(x.worn_count||0)>0).sort((a,b)=>new Date(b.last_worn_at||b.updated_at||0).getTime()-new Date(a.last_worn_at||a.updated_at||0).getTime());
 for(const look of worn){
  const ids=(look.item_ids||[]).map(String);
  if(ids.length&&recentLookSignatures.length<12)recentLookSignatures.push([...ids].sort().join('|'));
  for(const id of ids){
   wearCountByItem[id]=(wearCountByItem[id]||0)+Math.max(1,Number(look.worn_count||1));
   if(look.last_worn_at&&(!lastWornByItem[id]||new Date(look.last_worn_at)>new Date(lastWornByItem[id])))lastWornByItem[id]=look.last_worn_at;
  }
 }
 return {lastWornByItem,wearCountByItem,recentLookSignatures};
}

export async function markLookWorn(session:ClosetSession,look:SavedLook){
 const r=await fetch(`${url}/rest/v1/closet_saved_looks?id=eq.${encodeURIComponent(look.id)}`,{method:'PATCH',headers:headers(session.access_token,{'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify({worn_count:Number(look.worn_count||0)+1,last_worn_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
 const rows=await readJson(r);return hydrate(rows?.[0]);
}

export async function rateLook(session:ClosetSession,lookId:string,rating:'love'|'wear'|'not_me'){
 const r=await fetch(`${url}/rest/v1/closet_saved_looks?id=eq.${encodeURIComponent(lookId)}`,{method:'PATCH',headers:headers(session.access_token,{'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify({rating,updated_at:new Date().toISOString()})});
 const rows=await readJson(r);return hydrate(rows?.[0]);
}
