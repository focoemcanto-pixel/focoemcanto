'use client';

import {buildStyledLookV2,buildStyledLookWithAnchorV2} from './lookEngineV2';
import {memoryScore,type StylistMemory} from './stylistMemory';
import {fashionPulseScore,FASHION_PULSE_VERSION} from './fashionPulse';
import {hasSemanticBase} from './lookSemantics';
import type {StylistPiece,StyleProfile} from './lookEngine';

type Ctx={occasion?:string;detail?:string;period?:string;work_profile?:{dress_code?:string}|null};
function readContext():Ctx{if(typeof window==='undefined')return{};try{return JSON.parse(sessionStorage.getItem('closet_stylist_context')||'{}')||{}}catch{return{}}}
function signature(items:StylistPiece[]){return items.map(x=>String(x.id)).sort().join('|')}
function complete(items:StylistPiece[]){const dress=items.some(p=>p.category==='Vestidos'),bottom=items.some(p=>p.category==='Calças'),shoe=items.some(p=>p.category==='Calçados');return shoe&&(dress||(hasSemanticBase(items)&&bottom))}
function contextMemoryScore(items:StylistPiece[],occasion:string,profile:StyleProfile){const m=(profile as any).stylist_memory as StylistMemory|undefined;if(!m)return 0;const c=readContext(),ids=items.map(x=>String(x.id));let s=0;for(const p of items)s+=memoryScore(m,String(p.id),occasion,ids.filter(id=>id!==String(p.id)),{detail:c.detail,period:c.period,dress_code:c.work_profile?.dress_code})*.55;return Math.max(-45,Math.min(45,s))}
function trendScore(items:StylistPiece[],profile:StyleProfile){return Math.max(-6,Math.min(10,items.reduce((n,p)=>n+fashionPulseScore(p,profile),0)))}
function rotationScore(items:StylistPiece[]){return -Math.min(18,items.reduce((n,p)=>n+Number(p.rotationPenalty||0),0)*.8)}
function score(items:StylistPiece[],occasion:string,profile:StyleProfile,anchor?:StylistPiece){let s=contextMemoryScore(items,occasion,profile)+trendScore(items,profile)+rotationScore(items);if(complete(items))s+=80;else s-=80;if(anchor)s+=items.some(x=>String(x.id)===String(anchor.id))?120:-500;return s}
function overlap(a:StylistPiece[],b:StylistPiece[]){if(!a.length||!b.length)return 0;const ids=new Set(b.map(x=>String(x.id)));return a.filter(x=>ids.has(String(x.id))).length/Math.max(1,Math.min(a.length,b.length))}
function choose(candidates:StylistPiece[][],occasion:string,profile:StyleProfile,seed:number,anchor?:StylistPiece,avoid:StylistPiece[]=[]){const unique=new Map<string,StylistPiece[]>();for(const c of candidates)if(c?.length)unique.set(signature(c),c);const ranked=[...unique.values()].map(items=>{let s=score(items,occasion,profile,anchor);if(avoid.length){const shared=overlap(items,avoid);s-=shared>=.99?180:shared>=.66?52:shared>=.34?18:0}return{items,s}}).sort((a,b)=>b.s-a.s);if(!ranked.length)return[];const completeRanked=ranked.filter(x=>complete(x.items));const pool=completeRanked.length?completeRanked:ranked;const best=pool[0].s;const viable=pool.filter(x=>x.s>=best-18).slice(0,8);return viable[Math.abs(seed)%viable.length].items}
function variants(all:StylistPiece[],occasion:string,profile:StyleProfile,seed:number,anchor?:StylistPiece){const out:StylistPiece[][]=[];/* use spaced seeds so V2 explores different ranked windows instead of adjacent near-duplicates */for(let i=0;i<18;i++){const s=seed+i*3;out.push(anchor?buildStyledLookWithAnchorV2(all,anchor,occasion,profile,s) as StylistPiece[]:buildStyledLookV2(all,occasion,profile,s) as StylistPiece[])}return out}

export function buildStyledLookV3(all:StylistPiece[],occasion:string,profile:StyleProfile={},seed=0){return choose(variants(all,occasion,profile,seed),occasion,profile,seed)}
export function buildAlternativeLookV3(all:StylistPiece[],occasion:string,profile:StyleProfile={},seed=0,current:StylistPiece[]=[]){return choose(variants(all,occasion,profile,seed),occasion,profile,seed,undefined,current)}
export function buildStyledLookWithAnchorV3(all:StylistPiece[],anchor:StylistPiece,occasion:string,profile:StyleProfile={},seed=0){return choose(variants(all,occasion,profile,seed,anchor),occasion,profile,seed,anchor)}
export function buildAlternativeLookWithAnchorV3(all:StylistPiece[],anchor:StylistPiece,occasion:string,profile:StyleProfile={},seed=0,current:StylistPiece[]=[]){return choose(variants(all,occasion,profile,seed,anchor),occasion,profile,seed,anchor,current)}
export function stylistV3Meta(profile:StyleProfile={}){return{engine:'stylist-v3',fashionPulse:FASHION_PULSE_VERSION,trendInterest:Number((profile as any).trend_interest??.35)}}
