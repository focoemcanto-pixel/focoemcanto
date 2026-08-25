'use client';
import type {ClosetSession} from './supabase';
import type {SavedLook} from './savedLooks';
export type StylistMemory={occasionLikes:Record<string,Record<string,number>>;pairLikes:Record<string,number>;itemLikes:Record<string,number>;updatedAt:string};
const key=(uid:string)=>`closet.stylistMemory.v1.${uid}`;
const empty=():StylistMemory=>({occasionLikes:{},pairLikes:{},itemLikes:{},updatedAt:new Date().toISOString()});
export function loadStylistMemory(session:ClosetSession){try{return JSON.parse(localStorage.getItem(key(session.user.id))||'null')||empty()}catch{return empty()}}
function pairKey(a:string,b:string){return[a,b].sort().join('|')}
export function learnFromSavedLooks(session:ClosetSession,looks:SavedLook[]){const m=loadStylistMemory(session);for(const look of looks){const ids=(look.item_ids||[]).map(String),rating=String(look.rating||'');let delta=0;if(rating==='love')delta=5;else if(rating==='wear')delta=3;else if(rating==='not_me')delta=-7;else if(look.favorite)delta=1;if(!delta)continue;const o=look.occasion||'Geral';m.occasionLikes[o]||={};for(const id of ids){m.itemLikes[id]=(m.itemLikes[id]||0)+delta;m.occasionLikes[o][id]=(m.occasionLikes[o][id]||0)+delta}for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const k=pairKey(ids[i],ids[j]);m.pairLikes[k]=(m.pairLikes[k]||0)+delta}}
m.updatedAt=new Date().toISOString();localStorage.setItem(key(session.user.id),JSON.stringify(m));return m}
export function memoryScore(m:StylistMemory|undefined,itemId:string,occasion:string,withIds:string[]=[]){if(!m)return 0;let s=(m.itemLikes[itemId]||0)*.35+(m.occasionLikes[occasion]?.[itemId]||0)*.8;for(const id of withIds)s+=(m.pairLikes[pairKey(itemId,id)]||0)*.55;return Math.max(-25,Math.min(25,s))}
