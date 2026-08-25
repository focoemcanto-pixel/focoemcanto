'use client';
import type {ClosetSession} from './supabase';

const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
function headers(session:ClosetSession,extra:Record<string,string>={}){return {apikey:anon,Authorization:`Bearer ${session.access_token}`,...extra}}
async function read(r:Response){const t=await r.text();let d:any=null;try{d=t?JSON.parse(t):null}catch{d=t}if(!r.ok)throw new Error(d?.message||d?.error||`Supabase ${r.status}`);return d}
export type WardrobeStatus='available'|'laundry'|'repair'|'loaned'|'archived';
export async function setWardrobeStatus(session:ClosetSession,id:string|number,currentMetadata:Record<string,any>|null|undefined,status:WardrobeStatus){const metadata={...(currentMetadata||{}),wardrobe_status:status,status_updated_at:new Date().toISOString()};const r=await fetch(`${url}/rest/v1/closet_items?id=eq.${encodeURIComponent(String(id))}`,{method:'PATCH',headers:headers(session,{'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify({metadata,updated_at:new Date().toISOString()})});const rows=await read(r);return rows?.[0]}
export async function deleteWardrobeItem(session:ClosetSession,id:string|number){const r=await fetch(`${url}/rest/v1/closet_items?id=eq.${encodeURIComponent(String(id))}`,{method:'DELETE',headers:headers(session,{'Prefer':'return=minimal'})});if(!r.ok)await read(r);return true}
