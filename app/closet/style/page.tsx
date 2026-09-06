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
const routineOptions=[['trabalho','Trabalho'],['igreja','Igreja'],['aula','Aula / faculdade'],['eventos','Eventos'],['lazer','Lazer'],['academia','Academia']];
const workDressCodes=[
 ['formal','Formal','Terno, alfaiataria, sapato social e pouca informalidade.'],
 ['social','Social','Camisa, alfaiataria, blazer, mocassim e equivalentes.'],
 ['social-casual','Social casual','Arrumado, mas com espaço para chino, polo, jeans escuro e tênis minimalista.'],
 ['casual','Casual','Conforto e liberdade, mantendo aparência adequada ao trabalho.'],
 ['uniforme','Uniforme','O trabalho tem uniforme ou regras próprias; o Stylist deve ser conservador.'],
 ['criativo','Livre / criativo','Mais liberdade de cor, modelagem e linguagem pessoal.']
];

export default function StylePage(){
 const [session,setSession]=useState<ClosetSession|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[wardrobeGender,setWardrobeGender]=useState('misto'),[stylesPicked,setStylesPicked]=useState<string[]>([]),[preferredColors,setPreferredColors]=useState<string[]>([]),[avoidColors,setAvoidColors]=useState<string[]>([]),[fit,setFit]=useState('regular'),[boldness,setBoldness]=useState(.45),[toast,setToast]=useState('');
 const [routine,setRoutine]=useState<string[]>([]),[profession,setProfession]=useState(''),[workDressCode,setWorkDressCode]=useState('social-casual'),[workNotes,setWorkNotes]=useState('');
 const [thermalSensitivity,setThermalSensitivity]=useState(3),[trendInterest,setTrendInterest]=useState(.35);
 function notify(m:string){setToast(m);window.setTimeout(()=>setToast(''),2200)}
 useEffect(()=>{let alive=true;(async()=>{const s=await restoreClosetSession();if(!alive)return;if(!s){setLoading(false);return}setSession(s);const p:any=await loadStyleProfile(s);if(!alive)return;setWardrobeGender(p?.wardrobe_gender||p?.gender||'misto');setStylesPicked(p?.preferred_styles||p?.styles||[]);setPreferredColors(p?.preferred_colors||p?.colors||[]);setAvoidColors(p?.avoid_colors||[]);setFit(p?.fit||'regular');setBoldness(Number(p?.boldness??.45));setRoutine(Array.isArray(p?.routine_contexts)?p.routine_contexts:[]);setProfession(String(p?.work_profile?.profession||''));setWorkDressCode(String(p?.work_profile?.dress_code||'social-casual'));setWorkNotes(String(p?.work_profile?.notes||''));setThermalSensitivity(Number(p?.thermal_sensitivity??3));setTrendInterest(Number(p?.trend_interest??.35));setLoading(false)})().catch(()=>setLoading(false));return()=>{alive=false}},[]);
 const dna=useMemo(()=>{const base=stylesPicked.length?stylesPicked:['casual refinado'];return base.slice(0,3).map((s,i)=>`${s} ${Math.max(48,82-i*13)}%`).join(' · ')},[stylesPicked]);
 function toggle(list:string[],set:(v:string[])=>void,id:string,max=4){set(list.includes(id)?list.filter(x=>x!==id):list.length<max?[...list,id]:[...list.slice(1),id])}
 async function save(){if(!session)return;setSaving(true);try{await saveStyleProfile(session,{wardrobe_gender:wardrobeGender,gender:wardrobeGender,preferred_styles:stylesPicked,styles:stylesPicked,preferred_colors:preferredColors,colors:preferredColors,avoid_colors:avoidColors,fit,boldness,formality:stylesPicked.includes('clássico')?.65:.4,routine_contexts:routine,work_profile:{profession:profession.trim(),dress_code:workDressCode,notes:workNotes.trim()},thermal_sensitivity:thermalSensitivity,trend_interest:trendInterest,profile_version:3},true);notify('Seu perfil de estilo foi salvo ✦');window.setTimeout(()=>window.location.href='/closet/stylist',500)}catch(e:any){notify(e?.message||'Não consegui salvar seu estilo.')}finally{setSaving(false)}}
 if(!session&&!loading)return <main className={styles.page}><section className={styles.empty}><span>SEU ESTILO</span><h1>Entre no closet primeiro.</h1><button onClick={()=>window.location.href='/closet'}>Voltar</button></section></main>;
 return <main className={styles.page}>
  <header className={styles.header}><button onClick={()=>history.back()}>‹</button><div><span>STYLIST PESSOAL</span><strong>Seu DNA de estilo</strong></div><i/></header>
  {loading?<div className={styles.loading}>Conhecendo seu estilo…</div>:<section className={styles.content}>
   <div className={styles.hero}><span>PERFIL DO CLOSET</span><h1>Que tipo de guarda-roupa você usa?</h1><p>Isso define quais categorias fazem sentido e impede sugestões incompatíveis com o seu perfil.</p></div>
   <div className={styles.styleGrid}>{wardrobeProfiles.map(o=><button key={o.id} className={wardrobeGender===o.id?styles.selected:''} onClick={()=>setWardrobeGender(o.id)}><b>{o.title}</b><small>{o.hint}</small></button>)}</div>
   <div className={styles.block}><span>SUA ROTINA</span><p className={styles.blockText}>Marque os contextos que fazem parte da sua vida. O Stylist usa isso como memória permanente e não precisa perguntar tudo a cada look.</p><div className={styles.chips}>{routineOptions.map(([id,label])=><button key={id} className={routine.includes(id)?styles.activeChip:''} onClick={()=>toggle(routine,setRoutine,id,8)}>{label}</button>)}</div></div>
   {routine.includes('trabalho')&&<div className={styles.workCard}><span>SEU TRABALHO</span><h2>“Trabalho” não é um dress code.</h2><p>Professor, advogado, motorista, médico e designer podem precisar de roupas completamente diferentes. Conte ao Stylist como é o seu.</p><label>Profissão ou atividade<input value={profession} onChange={e=>setProfession(e.target.value)} placeholder="Ex.: professor, advogado, motorista de app"/></label><div className={styles.dressGrid}>{workDressCodes.map(([id,title,hint])=><button key={id} className={workDressCode===id?styles.selected:''} onClick={()=>setWorkDressCode(id)}><b>{title}</b><small>{hint}</small></button>)}</div><label>Regra ou observação opcional<textarea value={workNotes} onChange={e=>setWorkNotes(e.target.value)} placeholder="Ex.: posso usar tênis, preciso de mobilidade, não uso blazer no dia a dia..."/></label></div>}
   <div className={styles.block}><span>CONFORTO TÉRMICO</span><p className={styles.blockText}>Duas pessoas na mesma cidade podem sentir temperaturas de forma diferente. Isso ajuda o Stylist a decidir quando sugerir jaqueta, blazer, casaco ou peças leves.</p><div className={styles.rangeLabels}><small>Sinto calor fácil</small><small>Sinto frio fácil</small></div><input className={styles.range} type="range" min="1" max="5" step="1" value={thermalSensitivity} onChange={e=>setThermalSensitivity(Number(e.target.value))}/></div>
   <div className={styles.hero}><span>SEU DNA</span><h1>Qual visual mais parece com você?</h1><p>Escolha até quatro linguagens. O Stylist mistura isso com ocasião, clima e seu próprio guarda-roupa.</p><div className={styles.dna}>{dna}</div></div>
   <div className={styles.styleGrid}>{styleOptions.map(o=><button key={o.id} className={stylesPicked.includes(o.id)?styles.selected:''} onClick={()=>toggle(stylesPicked,setStylesPicked,o.id,4)}><b>{o.title}</b><small>{o.hint}</small></button>)}</div>
   <div className={styles.block}><span>CORES QUE VOCÊ GOSTA</span><div className={styles.chips}>{colors.map(c=><button key={c} className={preferredColors.includes(c)?styles.activeChip:''} onClick={()=>toggle(preferredColors,setPreferredColors,c,5)}>{c}</button>)}</div></div>
   <div className={styles.block}><span>CORES QUE VOCÊ EVITA</span><div className={styles.chips}>{colors.map(c=><button key={c} className={avoidColors.includes(c)?styles.avoidChip:''} onClick={()=>toggle(avoidColors,setAvoidColors,c,4)}>{c}</button>)}</div></div>
   <div className={styles.block}><span>CAIMENTO</span><div className={styles.fitGrid}>{fits.map(([id,label])=><button key={id} className={fit===id?styles.selected:''} onClick={()=>setFit(id)}><b>{label}</b></button>)}</div></div>
   <div className={styles.block}><span>OUSADIA</span><div className={styles.rangeLabels}><small>Discreto</small><small>Marcante</small></div><input className={styles.range} type="range" min="0" max="1" step="0.05" value={boldness} onChange={e=>setBoldness(Number(e.target.value))}/></div>
   <div className={styles.block}><span>TENDÊNCIA E MODA</span><p className={styles.blockText}>Tendência nunca deve mandar no seu look; ela entra só como um bônus quando combina com você.</p><div className={styles.rangeLabels}><small>Atemporal</small><small>Quero novidades</small></div><input className={styles.range} type="range" min="0" max="1" step="0.05" value={trendInterest} onChange={e=>setTrendInterest(Number(e.target.value))}/></div>
   <button className={styles.save} disabled={saving||!stylesPicked.length} onClick={save}>{saving?'Salvando seu perfil…':'Salvar e personalizar meus looks'}</button>
  </section>}
  <div className={`${styles.toast} ${toast?styles.show:''}`}>{toast}</div>
 </main>
}
