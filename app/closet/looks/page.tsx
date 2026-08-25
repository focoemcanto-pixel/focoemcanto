'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './saved-looks.module.css';
import { loadClosetItems, restoreClosetSession, type ClosetSession } from '../supabase';
import { loadSavedLooks, markLookWorn, type SavedLook } from '../savedLooks';

type Piece={id:string;name:string;category:string;image:string;meta:string};
const filters=['Todos','Igreja','Sair','Trabalho','Faculdade','Evento','Encontro','Festa','Viagem'];
function mapRows(rows:any[]):Piece[]{return rows.map(r=>({id:String(r.id),name:r.name,category:r.category,image:r.image||'',meta:[r.color,r.subcategory,r.pattern,r.style].filter(Boolean).join(' · ')}))}

export default function SavedLooksPage(){
 const [session,setSession]=useState<ClosetSession|null>(null),[looks,setLooks]=useState<SavedLook[]>([]),[pieces,setPieces]=useState<Piece[]>([]),[filter,setFilter]=useState('Todos'),[loading,setLoading]=useState(true),[error,setError]=useState(''),[toast,setToast]=useState('');
 function notify(m:string){setToast(m);window.setTimeout(()=>setToast(''),2200)}
 useEffect(()=>{let alive=true;(async()=>{try{const s=await restoreClosetSession();if(!alive)return;if(!s){setLoading(false);return}setSession(s);const [saved,rows]=await Promise.all([loadSavedLooks(s),loadClosetItems(s)]);if(!alive)return;setLooks(saved);setPieces(mapRows(rows))}catch(e:any){setError(e?.message||'Não consegui carregar seus looks.')}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[]);
 const pieceMap=useMemo(()=>new Map(pieces.map(p=>[p.id,p])),[pieces]);
 const visible=useMemo(()=>filter==='Todos'?looks:looks.filter(l=>l.occasion===filter),[looks,filter]);
 function itemsFor(look:SavedLook){return (look.item_ids||[]).map(String).map(id=>pieceMap.get(id)).filter(Boolean) as Piece[]}
 async function worn(look:SavedLook){if(!session)return;try{const next=await markLookWorn(session,look);setLooks(v=>v.map(x=>x.id===look.id?next:x));notify('Marcado como usado hoje ✦')}catch(e:any){notify(e?.message||'Não consegui atualizar o look.')}}
 function reopen(look:SavedLook){window.location.href=`/closet/look?saved=${encodeURIComponent(look.id)}`}
 if(!session&&!loading)return <main className={styles.page}><section className={styles.empty}><span>MEUS LOOKS</span><h1>Entre no closet.</h1><p>Seus favoritos ficam ligados à sua conta.</p><button onClick={()=>window.location.href='/closet'}>Voltar</button></section></main>;
 return <main className={styles.page}>
  <header className={styles.header}><button onClick={()=>window.location.href='/closet'}>‹</button><div><span>SEU ACERVO</span><strong>Meus looks</strong></div><button onClick={()=>window.location.href='/closet/look'}>＋</button></header>
  <section className={styles.hero}><span>LOOKS SALVOS</span><h1>Combinações que já são suas.</h1><p>Organizadas por ocasião para você repetir, adaptar e ensinar seu stylist.</p></section>
  <nav className={styles.filters}>{filters.map(f=><button key={f} className={filter===f?styles.active:''} onClick={()=>setFilter(f)}>{f}</button>)}</nav>
  {loading?<div className={styles.loading}>Carregando seu acervo…</div>:error?<div className={styles.error}>{error}<small>Se você ainda não aplicou a migration de looks salvos no Supabase, aplique antes de testar esta tela.</small></div>:!visible.length?<section className={styles.emptyCard}><span>{filter==='Todos'?'AINDA VAZIO':filter.toUpperCase()}</span><h2>{filter==='Todos'?'Seu primeiro favorito começa no provador.':'Nenhum look salvo aqui ainda.'}</h2><button onClick={()=>window.location.href=`/closet/look?occasion=${encodeURIComponent(filter==='Todos'?'Sair':filter)}`}>Montar um look</button></section>:<section className={styles.grid}>{visible.map(saved=>{const items=itemsFor(saved);return <article className={styles.card} key={saved.id}><button className={styles.preview} onClick={()=>reopen(saved)}>{items.slice(0,6).map((p,i)=><img key={p.id} src={p.image} alt={p.name} style={{animationDelay:`${i*45}ms`}}/>)}<span>{saved.occasion}</span></button><div className={styles.meta}><div><small>{saved.occasion.toUpperCase()}</small><strong>{saved.title||`Look para ${saved.occasion}`}</strong><p>{saved.worn_count?`Usado ${saved.worn_count} ${saved.worn_count===1?'vez':'vezes'}`:'Ainda não marcado como usado'}</p></div><button className={styles.heart}>♥</button></div><div className={styles.actions}><button onClick={()=>reopen(saved)}>Vestir novamente</button><button onClick={()=>worn(saved)}>Usei hoje</button></div></article>})}</section>}
  <div className={`${styles.toast} ${toast?styles.toastShow:''}`}>{toast}</div>
 </main>
}
