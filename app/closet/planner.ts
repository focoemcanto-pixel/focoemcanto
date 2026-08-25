'use client';

export type PlannedLook={id:string;date:string;occasion:string;title:string;itemIds:string[];savedLookId?:string|null;note?:string;createdAt:string};
const KEY='closet.plannedLooks.v1';
export function loadPlannedLooks():PlannedLook[]{if(typeof window==='undefined')return[];try{const raw=localStorage.getItem(KEY);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[]}catch{return[]}}
function persist(rows:PlannedLook[]){localStorage.setItem(KEY,JSON.stringify(rows));return rows}
export function planLook(input:Omit<PlannedLook,'id'|'createdAt'>){const rows=loadPlannedLooks();const row:PlannedLook={...input,id:crypto.randomUUID(),createdAt:new Date().toISOString()};return persist([row,...rows.filter(x=>!(x.date===row.date&&x.occasion===row.occasion))]),row}
export function removePlannedLook(id:string){return persist(loadPlannedLooks().filter(x=>x.id!==id))}
export function plannedForDate(date:string){return loadPlannedLooks().filter(x=>x.date===date)}
