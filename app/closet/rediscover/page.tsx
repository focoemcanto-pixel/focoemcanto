'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadClosetItems, restoreClosetSession, type ClosetSession } from '../supabase';
import { loadSavedLooks } from '../savedLooks';
import { enrichWithRotation } from '../rotation';
import styles from './rediscover.module.css';

type Piece={id:string;name:string;category:string;meta:string;image:string;lastWornAt?:string;wearCount?:number;rotationPenalty?:number};
function daysSince(iso?:string){if(!iso)return Infinity;return Math.floor((Date.now()-new Date(iso).getTime())/86400000)}
function label(p:Piece){const d=daysSince(p.lastWornAt);if(!Number.isFinite(d))return 'Ainda não registrada como usada';if(d>=60)return `Há ${d} dias sem usar`;if(d>=30)return `Há ${d} dias sem usar`;if(d>=14)return `Há ${d} dias fora da rotação`;return 'Pouco usada recentemente'}

export default function RediscoverPage(){
 const [session,setSession]=useState<ClosetSession|null>(null),[pieces,setPieces]=useState<Piece[]>([]),[loading,setLoading]=useState(true),[filter,setFilter]=useState('Todas');
 useEffect(()=>{let alive=true;(async()=>{const s=await restoreClosetSession();if(!alive)return;if(!s){setLoading(false);return}setSession(s);const [rows,looks]=await Promise.all([loadClosetItems(s),loadSavedLooks(s).catch(()=>[])]);if(!alive)return;const mapped=rows.map((r:any)=>({id:String(r.id),name:r.name,category:r.category,meta:[r.color,r.subcategory,r.pattern,r.style].filter(Boolean).join(' · '),image:r.image||'',wardrobeStatus:r.metadata?.wardrobe_status||'available'}));const enriched=enrichWithRotation(mapped as any,looks).map((p:any)=>({...p,id:String(p.id)}));setPieces(enriched);setLoading(false)})().catch(()=>setLoading(false));return()=>{alive=false}},[]);
 const forgotten=useMemo(()=>pieces.filter(p=>{const d=daysSince(p.lastWornAt);return !p.lastWornAt||d>=30||Number(p.wearCount||0)===0}).sort((a,b)=>daysSince(b.lastWornAt)-daysSince(a.lastWornAt)),[pieces]);
 const categories=useMemo(()=>['Todas',...Array.from(new Set(forgotten.map(p=>p.category)))],[forgotten]);
 const shown=useMemo(()=>forgotten.filter(p=>filter==='Todas'||p.category===filter),[forgotten,filter]);
 if(!session&&!loading)return <main className={styles.page}><section className={styles.empty}><span>REDESCOBRIR</span><h1>Entre no closet primeiro.</h1><button onClick={()=>window.location.href='/closet'}>Voltar ao closet</button></section></main>;
 return <main className={styles.page}>
  <header className={styles.header}><button onClick={()=>history.back()}>‹</button><div><span>REDESCOBRIR</span><strong>Peças esquecidas</strong></div><button onClick={()=>window.location.href='/closet'}>⌂</button></header>
  {loading?<div className={styles.loading}>Revendo seu guarda-roupa…</div>:<section className={styles.content}>
   <div className={styles.hero}><span>VOLTE A USAR O QUE JÁ TEM</span><h1>{forgotten.length?`${forgotten.length} ${forgotten.length===1?'peça merece':'peças merecem'} outra chance.`:'Seu closet está bem rodado.'}</h1><p>{forgotten.length?'Escolhi peças pouco usadas ou que ainda não apareceram no seu histórico. Toque em uma delas e o stylist monta um look inteiro ao redor dela.':'Continue marcando “Usei hoje” para eu entender melhor sua rotação.'}</p></div>
   {forgotten.length>0&&<><div className={styles.filters}>{categories.map(c=><button key={c} className={filter===c?styles.active:''} onClick={()=>setFilter(c)}>{c}</button>)}</div><div className={styles.grid}>{shown.map(p=><article key={p.id} className={styles.card}><div className={styles.visual}><img src={p.image} alt={p.name}/><span>{label(p)}</span></div><div className={styles.copy}><strong>{p.name}</strong><small>{p.meta||p.category}</small><button onClick={()=>window.location.href=`/closet/look?anchor=${encodeURIComponent(p.id)}`}>✦ Montar look com esta peça</button></div></article>)}</div></>}
   {!forgotten.length&&<div className={styles.allGood}><span>✓</span><strong>Boa rotação.</strong><p>Quando alguma peça ficar esquecida, ela aparece aqui automaticamente.</p><button onClick={()=>window.location.href='/closet/look'}>Montar um look</button></div>}
  </section>}
 </main>
}
