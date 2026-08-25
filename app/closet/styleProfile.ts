'use client';

import { ClosetSession } from './supabase';

const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';

export async function loadStyleProfile(session:ClosetSession){
  if(!url||!anon)return {};
  const r=await fetch(`${url}/rest/v1/closet_profiles?id=eq.${encodeURIComponent(session.user.id)}&select=style_profile,onboarding_completed&limit=1`,{headers:{apikey:anon,Authorization:`Bearer ${session.access_token}`}});
  if(!r.ok)return {};
  const rows=await r.json();
  return rows?.[0]?.style_profile||{};
}
