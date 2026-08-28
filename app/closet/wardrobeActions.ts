'use client';
import type {ClosetSession} from './supabase';

const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
const LOCAL_PLANS='closet.plannedLooks.v1';
function headers(session:ClosetSession,extra:Record<string,string>={}){return {apikey:anon,Authorization:`Bearer ${session.access_token}`,...extra}}
async function read(r:Response){const t=await r.text();let d:any=null;try{d=t?JSON.parse(t):null}catch{d=t}if(!r.ok)throw new Error(d?.message||d?.error||`Supabase ${r.status}`);return d}
export type WardrobeStatus='available'|'laundry'|'repair'|'loaned'|'archived';
export async function setWardrobeStatus(session:ClosetSession,id:string|number,currentMetadata:Record<string,any>|null|undefined,status:WardrobeStatus){const metadata={...(currentMetadata||{}),wardrobe_status:status,status_updated_at:new Date().toISOString()};const r=await fetch(`${url}/rest/v1/closet_items?id=eq.${encodeURIComponent(String(id))}`,{method:'PATCH',headers:headers(session,{'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify({metadata,updated_at:new Date().toISOString()})});const rows=await read(r);return rows?.[0]}
function complete(ids:string[],categories:Map<string,string>){const cats=ids.map(x=>categories.get(x)).filter(Boolean);return (cats.includes('Vestidos')&&cats.includes('Calçados'))||(cats.includes('Blusas')&&cats.includes('Calças')&&cats.includes('Calçados'))}
async function cleanupReferences(session:ClosetSession,deletedId:string){
 const [saved,plans]=await Promise.all([
  read(await fetch(`${url}/rest/v1/closet_saved_looks?user_id=eq.${session.user.id}&select=id,item_ids`,{headers:headers(session)})).catch(()=>[]),
  read(await fetch(`${url}/rest/v1/closet_planned_looks?user_id=eq.${session.user.id}&select=id,item_ids`,{headers:headers(session)})).catch(()=>[])
 ]) as [any[],any[]];
 const affected=[...saved,...plans].filter(r=>(r.item_ids||[]).map(String).includes(deletedId));
 const remainingIds=Array.from(new Set(affected.flatMap(r=>(r.item_ids||[]).map(String).filter((x:string)=>x!==deletedId))));
 const categories=new Map<string,string>();
 if(remainingIds.length){
  const rows=await read(await fetch(`${url}/rest/v1/closet_items?id=in.(${remainingIds.map(encodeURIComponent).join(',')})&select=id,category`,{headers:headers(session)})).catch(()=>[]);
  for(const row of rows||[])categories.set(String(row.id),String(row.category));
 }
 for(const row of saved){if(!(row.item_ids||[]).map(String).includes(deletedId))continue;const next=(row.item_ids||[]).map(String).filter((x:string)=>x!==deletedId);const endpoint=`${url}/rest/v1/closet_saved_looks?id=eq.${encodeURIComponent(String(row.id))}&user_id=eq.${session.user.id}`;if(complete(next,categories))await fetch(endpoint,{method:'PATCH',headers:headers(session,{'Content-Type':'application/json'}),body:JSON.stringify({item_ids:next,updated_at:new Date().toISOString()})});else await fetch(endpoint,{method:'DELETE',headers:headers(session)})}
 for(const row of plans){if(!(row.item_ids||[]).map(String).includes(deletedId))continue;const next=(row.item_ids||[]).map(String).filter((x:string)=>x!==deletedId);const endpoint=`${url}/rest/v1/closet_planned_looks?id=eq.${encodeURIComponent(String(row.id))}&user_id=eq.${session.user.id}`;if(complete(next,categories))await fetch(endpoint,{method:'PATCH',headers:headers(session,{'Content-Type':'application/json'}),body:JSON.stringify({item_ids:next,updated_at:new Date().toISOString()})});else await fetch(endpoint,{method:'DELETE',headers:headers(session)})}
 if(typeof window!=='undefined'){try{const local=JSON.parse(localStorage.getItem(LOCAL_PLANS)||'[]');if(Array.isArray(local)){const cleaned=local.map((p:any)=>({...p,itemIds:(p.itemIds||[]).map(String).filter((x:string)=>x!==deletedId)})).filter((p:any)=>complete(p.itemIds||[],categories));localStorage.setItem(LOCAL_PLANS,JSON.stringify(cleaned))}}catch{}}
}
export async function deleteWardrobeItem(session:ClosetSession,id:string|number){const deletedId=String(id);await cleanupReferences(session,deletedId);const r=await fetch(`${url}/rest/v1/closet_items?id=eq.${encodeURIComponent(deletedId)}`,{method:'DELETE',headers:headers(session,{'Prefer':'return=minimal'})});if(!r.ok)await read(r);return true}
