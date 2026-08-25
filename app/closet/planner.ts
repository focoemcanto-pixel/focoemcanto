'use client';

import type { ClosetSession } from './supabase';

export type PlannedLook={id:string;date:string;occasion:string;title:string;itemIds:string[];savedLookId?:string|null;note?:string;weather?:Record<string,any>;createdAt:string;updatedAt?:string};
const KEY='closet.plannedLooks.v1';
const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
function headers(token:string,extra:Record<string,string>={}){return {apikey:anon,Authorization:`Bearer ${token}`,...extra}}
async function readJson(r:Response){const t=await r.text();let data:any=null;try{data=t?JSON.parse(t):null}catch{data=t}if(!r.ok)throw new Error(data?.message||data?.error||`Supabase ${r.status}`);return data}
function fromDb(r:any):PlannedLook{return {id:String(r.id),date:String(r.planned_date),occasion:r.occasion,title:r.title||`Look para ${r.occasion}`,itemIds:(r.item_ids||[]).map(String),savedLookId:r.saved_look_id||null,note:r.note||'',weather:r.weather||{},createdAt:r.created_at,updatedAt:r.updated_at}}

export function loadPlannedLooks():PlannedLook[]{if(typeof window==='undefined')return[];try{const raw=localStorage.getItem(KEY);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[]}catch{return[]}}
function persist(rows:PlannedLook[]){if(typeof window!=='undefined')localStorage.setItem(KEY,JSON.stringify(rows));return rows}
export function planLook(input:Omit<PlannedLook,'id'|'createdAt'>){const rows=loadPlannedLooks();const row:PlannedLook={...input,id:crypto.randomUUID(),createdAt:new Date().toISOString()};return persist([row,...rows.filter(x=>!(x.date===row.date&&x.occasion===row.occasion))]),row}
export function removePlannedLook(id:string){return persist(loadPlannedLooks().filter(x=>x.id!==id))}
export function plannedForDate(date:string){return loadPlannedLooks().filter(x=>x.date===date)}

export async function loadCloudPlannedLooks(session:ClosetSession){
 const r=await fetch(`${url}/rest/v1/closet_planned_looks?select=*&order=planned_date.asc,created_at.desc`,{headers:headers(session.access_token)});
 const rows=await readJson(r) as any[];const plans=rows.map(fromDb);persist(plans);return plans;
}

export async function saveCloudPlannedLook(session:ClosetSession,input:{date:string;occasion:string;title:string;itemIds:string[];savedLookId?:string|null;note?:string;weather?:Record<string,any>}){
 const payload={user_id:session.user.id,planned_date:input.date,occasion:input.occasion,title:input.title,item_ids:input.itemIds,saved_look_id:input.savedLookId||null,note:input.note||null,weather:input.weather||{},updated_at:new Date().toISOString()};
 const r=await fetch(`${url}/rest/v1/closet_planned_looks?on_conflict=user_id,planned_date,occasion`,{method:'POST',headers:headers(session.access_token,{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=representation'}),body:JSON.stringify(payload)});
 const rows=await readJson(r);const row=fromDb(rows?.[0]);const local=[row,...loadPlannedLooks().filter(x=>x.id!==row.id&&!(x.date===row.date&&x.occasion===row.occasion))];persist(local);return row;
}

export async function deleteCloudPlannedLook(session:ClosetSession,id:string){
 const r=await fetch(`${url}/rest/v1/closet_planned_looks?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:headers(session.access_token,{'Prefer':'return=minimal'})});
 if(!r.ok)await readJson(r);removePlannedLook(id);return true;
}
