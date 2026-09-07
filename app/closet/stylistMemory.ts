'use client';

import type { ClosetSession } from './supabase';
import type { SavedLook } from './savedLooks';

export type StylistMemory = {
  occasionLikes: Record<string, Record<string, number>>;
  contextLikes: Record<string, Record<string, number>>;
  tagLikes: Record<string, number>;
  pairLikes: Record<string, number>;
  itemLikes: Record<string, number>;
  signals?: Record<string, number>;
  updatedAt: string;
};

const key = (uid: string) => `closet.stylistMemory.v2.${uid}`;
const oldKey = (uid: string) => `closet.stylistMemory.v1.${uid}`;

const empty = (): StylistMemory => ({occasionLikes:{},contextLikes:{},tagLikes:{},pairLikes:{},itemLikes:{},signals:{},updatedAt:new Date().toISOString()});
function norm(v:string){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/-/g,' ').replace(/\s+/g,' ').trim()}
function pairKey(a:string,b:string){return[a,b].sort().join('|')}
function saveMemory(session:ClosetSession,m:StylistMemory){m.updatedAt=new Date().toISOString();localStorage.setItem(key(session.user.id),JSON.stringify(m));return m}
export function stylistContextKey(input:{occasion?:string;detail?:string;period?:string;dress_code?:string}|null|undefined){const p=[input?.occasion,input?.detail,input?.period,input?.dress_code].filter(Boolean).map(x=>norm(String(x)));return p.join('::')||'geral'}

export function loadStylistMemory(session:ClosetSession):StylistMemory{try{const current=JSON.parse(localStorage.getItem(key(session.user.id))||'null');if(current)return{...empty(),...current,contextLikes:current.contextLikes||{},tagLikes:current.tagLikes||{}};const legacy=JSON.parse(localStorage.getItem(oldKey(session.user.id))||'null');if(legacy){const migrated={...empty(),...legacy,contextLikes:{},tagLikes:{}};saveMemory(session,migrated);return migrated}return empty()}catch{return empty()}}

export function projectMemoryForCurrentContext(memory:StylistMemory){if(typeof window==='undefined')return memory;let c:any={};try{c=JSON.parse(sessionStorage.getItem('closet_stylist_context')||'{}')||{}}catch{}const occasion=String(c.occasion||'');if(!occasion)return memory;const ck=stylistContextKey({occasion,detail:c.detail,period:c.period,dress_code:c.work_profile?.dress_code});const specific=memory.contextLikes?.[ck]||{};if(!Object.keys(specific).length)return memory;const merged={...(memory.occasionLikes?.[occasion]||{})};for(const [id,value] of Object.entries(specific))merged[id]=(merged[id]||0)+Number(value||0)*1.15;return{...memory,occasionLikes:{...(memory.occasionLikes||{}),[occasion]:merged}}}

export function learnFromSavedLooks(session:ClosetSession,looks:SavedLook[]){const previous=loadStylistMemory(session),m=empty();m.signals={...(previous.signals||{})};for(const [signal,value] of Object.entries(m.signals)){if(!signal.startsWith('purchase:item:')&&!signal.startsWith('manual:'))continue;if(signal.startsWith('purchase:item:')){const itemId=signal.slice('purchase:item:'.length);if(itemId)m.itemLikes[itemId]=(m.itemLikes[itemId]||0)+Number(value||0)*2}}
 for(const look of looks){const ids=(look.item_ids||[]).map(String),rating=String(look.rating||'');let delta=rating==='love'?5:rating==='wear'?3:rating==='not_me'?-7:0;delta+=Math.min(3,Number(look.worn_count||0))*.7;if(!delta)continue;const occasion=look.occasion||'Geral',ctx=look.stylist_context||{},contextKey=stylistContextKey({occasion,detail:ctx.detail,period:ctx.period,dress_code:ctx.work_profile?.dress_code}),tags=[occasion,...(Array.isArray(ctx.tags)?ctx.tags:[]),...(Array.isArray(ctx.colors)?ctx.colors:[]),ctx.period,ctx.detail,ctx.work_profile?.dress_code].filter(Boolean).map(x=>norm(String(x)));m.occasionLikes[occasion]||={};m.contextLikes[contextKey]||={};for(const id of ids){m.itemLikes[id]=(m.itemLikes[id]||0)+delta;m.occasionLikes[occasion][id]=(m.occasionLikes[occasion][id]||0)+delta;m.contextLikes[contextKey][id]=(m.contextLikes[contextKey][id]||0)+delta}for(const tag of new Set(tags))m.tagLikes[tag]=(m.tagLikes[tag]||0)+delta*.5;for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const pair=pairKey(ids[i],ids[j]);m.pairLikes[pair]=(m.pairLikes[pair]||0)+delta}}
 // Reaplica sinais comportamentais persistentes depois de reconstruir a memória dos looks.
 for(const [signal,value] of Object.entries(m.signals||{})){if(!signal.startsWith('manual:item:'))continue;const parts=signal.split(':');const itemId=parts[2],occasion=decodeURIComponent(parts.slice(3).join(':')||'Geral'),delta=Number(value||0);if(!itemId||!delta)continue;m.itemLikes[itemId]=(m.itemLikes[itemId]||0)+delta;m.occasionLikes[occasion]||={};m.occasionLikes[occasion][itemId]=(m.occasionLikes[occasion][itemId]||0)+delta}
 return saveMemory(session,m)}

export function learnFromMarketplacePurchase(session:ClosetSession,itemId:string,category:string){const m=loadStylistMemory(session);m.signals||={};const itemSignal=`purchase:item:${itemId}`;m.signals[itemSignal]=(m.signals[itemSignal]||0)+1;m.itemLikes[itemId]=(m.itemLikes[itemId]||0)+2;const categorySignal=`purchase:${category.toLowerCase()}`;m.signals[categorySignal]=(m.signals[categorySignal]||0)+1;return saveMemory(session,m)}

export function learnFromManualChoice(session:ClosetSession,input:{occasion:string;selectedId:string;replacedId?:string|null;withIds?:string[];detail?:string;period?:string;dress_code?:string}){const m=loadStylistMemory(session),occasion=input.occasion||'Geral',ck=stylistContextKey({occasion,detail:input.detail,period:input.period,dress_code:input.dress_code}),selected=String(input.selectedId);m.signals||={};m.occasionLikes[occasion]||={};m.contextLikes[ck]||={};m.itemLikes[selected]=(m.itemLikes[selected]||0)+1.4;m.occasionLikes[occasion][selected]=(m.occasionLikes[occasion][selected]||0)+2.2;m.contextLikes[ck][selected]=(m.contextLikes[ck][selected]||0)+2.8;const signal=`manual:item:${selected}:${encodeURIComponent(occasion)}`;m.signals[signal]=(m.signals[signal]||0)+1.1;for(const id of input.withIds||[]){if(id===selected)continue;const k=pairKey(selected,String(id));m.pairLikes[k]=(m.pairLikes[k]||0)+.8}if(input.replacedId&&String(input.replacedId)!==selected){const old=String(input.replacedId);m.itemLikes[old]=(m.itemLikes[old]||0)-.7;m.occasionLikes[occasion][old]=(m.occasionLikes[occasion][old]||0)-1;m.contextLikes[ck][old]=(m.contextLikes[ck][old]||0)-1.3;const oldSignal=`manual:item:${old}:${encodeURIComponent(occasion)}`;m.signals[oldSignal]=(m.signals[oldSignal]||0)-.45}return saveMemory(session,m)}

export function memoryScore(m:StylistMemory|undefined,itemId:string,occasion:string,withIds:string[]=[],context?:{detail?:string;period?:string;dress_code?:string}){if(!m)return 0;const ck=stylistContextKey({occasion,...context});let score=(m.itemLikes[itemId]||0)*.25+(m.occasionLikes[occasion]?.[itemId]||0)*.55+(m.contextLikes?.[ck]?.[itemId]||0)*.9;for(const id of withIds)score+=(m.pairLikes[pairKey(itemId,id)]||0)*.5;return Math.max(-30,Math.min(30,score))}
