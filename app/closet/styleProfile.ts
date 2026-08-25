'use client';

import { ClosetSession } from './supabase';
import { loadStylistMemory } from './stylistMemory';

const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
function auth(session:ClosetSession,extra:Record<string,string>={}){return {apikey:anon,Authorization:`Bearer ${session.access_token}`,...extra}}

export async function loadStyleProfile(session:ClosetSession){
  const memory=loadStylistMemory(session);
  if(!url||!anon)return {stylist_memory:memory};
  const r=await fetch(`${url}/rest/v1/closet_profiles?id=eq.${encodeURIComponent(session.user.id)}&select=style_profile,onboarding_completed&limit=1`,{headers:auth(session)});
  if(!r.ok)return {stylist_memory:memory};
  const rows=await r.json();
  return {...(rows?.[0]?.style_profile||{}),stylist_memory:memory};
}

export async function saveStyleProfile(session:ClosetSession,styleProfile:Record<string,any>,completed=true){
  if(!url||!anon)throw new Error('Supabase não configurado no deploy.');
  // Memória adaptativa é derivada do uso e fica fora do JSON persistido do perfil.
  const {stylist_memory,...persistable}=styleProfile||{};
  const payload={style_profile:{...persistable,updated_at:new Date().toISOString()},onboarding_completed:completed,updated_at:new Date().toISOString()};
  const r=await fetch(`${url}/rest/v1/closet_profiles?id=eq.${encodeURIComponent(session.user.id)}`,{method:'PATCH',headers:auth(session,{'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify(payload)});
  const text=await r.text();let data:any=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok)throw new Error(data?.message||data?.error||'Não consegui salvar seu perfil de estilo.');
  return {...(data?.[0]?.style_profile||payload.style_profile),stylist_memory};
}
