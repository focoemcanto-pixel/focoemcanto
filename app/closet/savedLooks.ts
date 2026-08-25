'use client';

import type { ClosetSession } from './supabase';

export type SavedLook={
 id:string;user_id:string;occasion:string;title?:string|null;item_ids:string[];favorite:boolean;rating?:string|null;worn_count:number;last_worn_at?:string|null;notes?:string|null;created_at?:string;updated_at?:string;
};

const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
function headers(token:string,extra:Record<string,string>={}){return {apikey:anon,Authorization:`Bearer ${token}`,...extra}}
function friendly(raw:any){const msg=String(raw?.message||raw?.error||raw||'');if(/closet_saved_looks|schema cache|could not find the table/i.test(msg))return 'A biblioteca de looks ainda não foi ativada no Supabase.';return msg||'Não consegui acessar seus looks salvos.'}
async function readJson(r:Response){const t=await r.text();let data:any=null;try{data=t?JSON.parse(t):null}catch{data=t}if(!r.ok)throw new Error(friendly(data));return data}

export async function saveLook(session:ClosetSession,input:{occasion:string;itemIds:string[];title?:string;rating?:string;notes?:string}){
 const payload={user_id:session.user.id,occasion:input.occasion,title:input.title||`Look para ${input.occasion}`,item_ids:input.itemIds,favorite:true,rating:input.rating||'saved',notes:input.notes||null,worn_count:0};
 const r=await fetch(`${url}/rest/v1/closet_saved_looks`,{method:'POST',headers:headers(session.access_token,{'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify(payload)});
 const rows=await readJson(r);return rows?.[0] as SavedLook;
}

export async function loadSavedLooks(session:ClosetSession){
 const r=await fetch(`${url}/rest/v1/closet_saved_looks?select=*&order=created_at.desc`,{headers:headers(session.access_token)});
 return await readJson(r) as SavedLook[];
}

export async function markLookWorn(session:ClosetSession,look:SavedLook){
 const r=await fetch(`${url}/rest/v1/closet_saved_looks?id=eq.${encodeURIComponent(look.id)}`,{method:'PATCH',headers:headers(session.access_token,{'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify({worn_count:Number(look.worn_count||0)+1,last_worn_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
 const rows=await readJson(r);return rows?.[0] as SavedLook;
}

export async function rateLook(session:ClosetSession,lookId:string,rating:'love'|'wear'|'not_me'){
 const r=await fetch(`${url}/rest/v1/closet_saved_looks?id=eq.${encodeURIComponent(lookId)}`,{method:'PATCH',headers:headers(session.access_token,{'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify({rating,updated_at:new Date().toISOString()})});
 const rows=await readJson(r);return rows?.[0] as SavedLook;
}
