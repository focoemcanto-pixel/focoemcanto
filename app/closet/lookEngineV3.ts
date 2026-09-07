'use client';

import {buildStyledLookV2,buildStyledLookWithAnchorV2} from './lookEngineV2';
import {memoryScore,type StylistMemory} from './stylistMemory';
import {fashionPulseScore,FASHION_PULSE_VERSION} from './fashionPulse';
import type {StylistPiece,StyleProfile} from './lookEngine';

type Ctx={occasion?:string;detail?:string;period?:string;work_profile?:{dress_code?:string}|null};
function readContext():Ctx{if(typeof window==='undefined')return{};try{return JSON.parse(sessionStorage.getItem('closet_stylist_context')||'{}')||{}}catch{return{}}}
function signature(items:StylistPiece[]){return items.map(x=>String(x.id)).sort().join('|')}
function contextMemoryScore(items:StylistPiece[],occasion:string,profile:StyleProfile){const m=(profile as any).stylist_memory as StylistMemory|undefined;if(!m)return 0;const c=readContext(),ids=items.map(x=>String(x.id));let s=0;for(const p of items)s+=memoryScore(m,String(p.id),occasion,ids.filter(id=>id!==String(p.id)),{detail:c.detail,period:c.period,dress_code:c.work_profile?.dress_code})*.55;return Math.max(-45,Math.min(45,s))}
function trendScore(items:StylistPiece[],profile:StyleProfile){return Math.max(-6,Math.min(10,items.reduce((n,p)=>n+fashionPulseScore(p,profile),0)))}
function rotationScore(items:StylistPiece[]){return -Math.min(18,items.reduce((n,p)=>n+Number(p.rotationPenalty||0),0)*.8)}
function score(items:StylistPiece[],occasion:string,profile:StyleProfile){return contextMemoryScore(items,occasion,profile)+trendScore(items,profile)+rotationScore(items)}
function choose(candidates:StylistPiece[][],occasion:string,profile:StyleProfile,seed:number){const unique=new Map<string,StylistPiece[]>();for(const c of candidates)if(c?.length)unique.set(signature(c),c);const ranked=[...unique.values()].map(items=>({items,s:score(items,occasion,profile)})).sort((a,b)=>b.s-a.s);if(!ranked.length)return[];const best=ranked[0].s,viable=ranked.filter(x=>x.s>=best-7).slice(0,5);return viable[Math.abs(seed)%viable.length].items}

export function buildStyledLookV3(all:StylistPiece[],occasion:string,profile:StyleProfile={},seed=0){
 const variants:StylistPiece[][]=[];for(let i=0;i<6;i++)variants.push(buildStyledLookV2(all,occasion,profile,seed+i) as StylistPiece[]);return choose(variants,occasion,profile,seed);
}
export function buildStyledLookWithAnchorV3(all:StylistPiece[],anchor:StylistPiece,occasion:string,profile:StyleProfile={},seed=0){
 const variants:StylistPiece[][]=[];for(let i=0;i<6;i++)variants.push(buildStyledLookWithAnchorV2(all,anchor,occasion,profile,seed+i) as StylistPiece[]);return choose(variants,occasion,profile,seed);
}
export function stylistV3Meta(profile:StyleProfile={}){return{engine:'stylist-v3',fashionPulse:FASHION_PULSE_VERSION,trendInterest:Number((profile as any).trend_interest??.35)}}
