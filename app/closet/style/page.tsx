'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './style.module.css';
import { restoreClosetSession, type ClosetSession } from '../supabase';
import { loadStyleProfile, saveStyleProfile } from '../styleProfile';

const styleOptions=[
 {id:'minimalista',title:'Minimalista',hint:'Poucas cores, linhas limpas'},
 {id:'casual refinado',title:'Casual refinado',hint:'Confortável, mas arrumado'},
 {id:'clássico',title:'Clássico',hint:'Peças atemporais e elegantes'},
 {id:'street',title:'Street',hint:'Urbano, atual e mais solto'},
 {id:'esportivo',title:'Esportivo',hint:'Funcional e confortável'},
 {id:'marcante',title:'Marcante',hint:'Mais cor, contraste e presença'}
];
const colors=['preto','branco','off-white','bege','cinza','marrom','azul marinho','azul','verde oliva','verde','vinho','vermelho'];
const fits=[['slim','Mais ajustado'],['regular','Equilibrado'],['relaxed','Mais solto']];
const wardrobeProfiles=[
 {id:'masculino',title:'Masculino',hint:'Categorias e combinações de guarda-roupa masculino'},
 {id:'feminino',title:'Feminino',hint:'Categorias e combinações de guarda-roupa feminino'},
 {id:'misto',title:'Sem limitar',hint:'Não restringir categorias pelo perfil'}
];

export default function StylePage(){
 const [session,setSession]=useState<ClosetSession|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[wardrobeGender,setWardrobeGender]=useState('misto'),[stylesPicked,setStylesPicked]=useState<string[]>([]),[preferredColors,setPreferredColors]=useState<string[]>([]),[avoidColors,setAvoidColors]=useState<string[]>([]),[fit,setFit]=useState('regular'),[boldness,setBoldness]=useState(.45),[toast,setToast]=useState('');
 function notify(m:string){setToast(m);window.setTimeout(()=>setToast(''),2200)}
 useEffect(()=>{let alive=true;(async()=>{const s=await restoreClosetSession();if(!alive)return;if(!s){setLoading(false);return}setSession(s);const p:any=await loadStyleProfile(s);if(!alive)return;setWardrobeGender(p?.wardrobe_gender||p?.gender||'misto');setStylesPicked(p?.preferred_styles||p?.styles||[]);setPreferredColors(p?.preferred_colors||p?.colors||[]);setAvoidColors(p?.avoid_colors||[]);setFit(p?.fit||'regular');setBoldness(Number(p?.boldness??.45));setLoading(false)})().catch(()=>setLoading(false));return()=>{alive=false}},[]);
 const dna=useMemo(()=>{const base=stylesPicked.length?stylesPicked:['casual refinado'];return base.slice(0,3).map((s,i)=>`${s} ${Math.max(48,82-i*13)}%`).join(' · ')},[stylesPicked]);
 function toggle(list:string[],set:(v:string[])=>void,id:string,max=4){set(list.includes(id)?list.filter(x=>x!==id):list.length<max?[...list,id]:[...list.slice(1),id])}
 async function save(){if(!session)return;setSaving(true);try{await saveStyleProfile(session,{wardrobe_gender:wardrobeGender,gender:wardrobeGender,preferred_styles:stylesPicked,styles:stylesPicked,preferred_colors:preferredColors,colors:preferredColors,avoid_colors:avoidColors,fit,boldness,formality:stylesPicked.includes('clássico')?.65:.4,profile_version:2},true);notify('Seu perfil de estilo foi salvo ✦');window.setTimeout(()=>window.location.href='/closet/look',500)}catch(e:any){notify(e?.message||'Não consegui salvar seu estilo.')}finally{setSaving(false)}}
 if(!session&&!loading)return <main className={styles.page}><section className={styles.empty}><span>SEU ESTILO</span><h1>Entre no closet primeiro.</h1><button onClick={()=>window.location.href='/closet'}>Voltar</button></section></main>;
 return <main className={styles.page}>
  <header className={styles.header}><button onClick={()=>history.back()}>‹</button><div><span>STYLIST PESSOAL</span><strong>Seu DNA de estilo</strong></div><i/></header>
  {loading?<div className={styles.loading}>Conhecendo seu estilo…</div>:<section className={styles.content}>
   <div className={styles.hero}><span>PERFIL DO CLOSET</span><h1>Que tipo de guarda-roupa você usa?</h1><p>Isso define quais categorias fazem sentido para o seu closet e impede o stylist de sugerir peças incompatíveis com o seu perfil.</p></div>
   <div className={styles.styleGrid}>{wardrobeProfiles.map(o=><button key={o.id} className={wardrobeGender===o.id?styles.selected:''} onClick={()=>setWardrobeGender(o.id)}><b>{o.title}</b><small>{o.hint}</small></button>)}</div>
   <div className={styles.hero}><span>SEU DNA</span><h1>Qual visual mais parece com você?</h1><p>Escolha até quatro linguagens. O stylist mistura isso com ocasião, clima e seu próprio guarda-roupa.</p><div className={styles.dna}>{dna}</div></div>
   <div className={styles.styleGrid}>{styleOptions.map(o=><button key={o.id} className={stylesPicked.includes(o.id)?styles.selected:''} onClick={()=>toggle(stylesPicked,setStylesPicked,o.id,4)}><b>{o.title}</b><small>{o.hint}</small></button>)}</div>
   <div className={styles.block}><span>CORES QUE VOCÊ GOSTA</span><div className={styles.chips}>{colors.map(c=><button key={c} className={preferredColors.includes(c)?styles.activeChip:''} onClick={()=>toggle(preferredColors,setPreferredColors,c,5)}>{c}</button>)}</div></div>
   <div className={styles.block}><span>CORES QUE VOCÊ EVITA</span><div className={styles.chips}>{colors.map(c=><button key={c} className={avoidColors.includes(c)?styles.avoidChip:''} onClick={()=>toggle(avoidColors,setAvoidColors,c,4)}>{c}</button>)}</div></div>
   <div className={styles.block}><span>CAIMENTO</span><div className={styles.fitGrid}>{fits.map(([id,label])=><button key={id} className={fit===id?styles.selected:''} onClick={()=>setFit(id)}><b>{label}</b></button>)}</div></div>
   <div className={styles.block}><span>OUSADIA</span><div className={styles.rangeLabels}><small>Discreto</small><small>Marcante</small></div><input className={styles.range} type="range" min="0" max="1" step="0.05" value={boldness} onChange={e=>setBoldness(Number(e.target.value))}/></div>
   <button className={styles.save} disabled={saving||!stylesPicked.length} onClick={save}>{saving?'Salvando seu perfil…':'Salvar e personalizar meus looks'}</button>
  </section>}
  <div className={`${styles.toast} ${toast?styles.show:''}`}>{toast}</div>
 </main>
}
