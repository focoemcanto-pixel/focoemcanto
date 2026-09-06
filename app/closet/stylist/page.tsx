'use client';

import {useEffect,useMemo,useState} from 'react';
import {loadClosetItems,restoreClosetSession,type ClosetSession} from '../supabase';
import styles from './stylist.module.css';

type Step='occasion'|'period'|'detail'|'palette';

type QuickOccasion='Igreja'|'Trabalho'|'Aula'|'Encontro'|'Festa'|'Evento'|'Passeio'|'Viagem';

const quickOccasions:QuickOccasion[]=['Igreja','Trabalho','Aula','Encontro','Festa','Evento','Passeio','Viagem'];
const details:Record<QuickOccasion,string[]>={
 Igreja:['Culto comum','Ministrar / servir','Evento especial'],
 Trabalho:['Dia normal','Reunião importante','Evento profissional'],
 Aula:['Aula comum','Apresentação / seminário','Evento'],
 Encontro:['Casual','Jantar','Especial / mais arrumado'],
 Festa:['Casual','Arrumada','Formal'],
 Evento:['Casual arrumado','Cerimônia','Formal'],
 Passeio:['Passeio casual','Almoço / shopping','Jantar / noite'],
 Viagem:['Deslocamento','Passeio','Jantar / evento']
};
const genericDetails=['Casual','Arrumado','Formal'];
const periods=[['manha','Manhã'],['tarde','Tarde'],['noite','Noite']] as const;

const palette=[
 ['Preto','#171717'],['Grafite','#434343'],['Cinza','#7a7a78'],['Cinza claro','#c7c6c2'],['Branco','#f8f7f2'],['Off-white','#eee8d8'],
 ['Bege','#d7c4a7'],['Caramelo','#a87143'],['Marrom','#6c4934'],['Vinho','#6f3840'],['Vermelho','#aa493f'],['Terracota','#a86145'],
 ['Laranja','#c8793f'],['Amarelo','#d1aa42'],['Verde oliva','#74774d'],['Verde','#54705a'],['Verde escuro','#354c3d'],['Azul claro','#8db1ce'],
 ['Azul','#567fa5'],['Azul-marinho','#27384f'],['Lilás','#a18cac'],['Roxo','#765b82'],['Rosa','#c98f98'],['Rosa claro','#ddb9bf']
] as const;

function norm(v:string){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/-/g,' ').replace(/\s+/g,' ').trim()}
function normalizeColor(v:string){return v.trim().replace(/\s+/g,' ')}

export default function StylistSetup(){
 const [session,setSession]=useState<ClosetSession|null>(null),[loading,setLoading]=useState(true),[step,setStep]=useState<Step>('occasion'),[anchor,setAnchor]=useState('');
 const [quickOccasion,setQuickOccasion]=useState<QuickOccasion|null>(null),[customOccasion,setCustomOccasion]=useState(''),[period,setPeriod]=useState(''),[detail,setDetail]=useState(''),[wardrobeColors,setWardrobeColors]=useState<string[]>([]),[selected,setSelected]=useState<string[]>([]),[autoPalette,setAutoPalette]=useState(true);
 const progress=step==='occasion'?1:step==='period'?2:step==='detail'?3:4;
 const occasion=customOccasion.trim()||quickOccasion||'';
 const currentDetails=quickOccasion&&!customOccasion.trim()?details[quickOccasion]:genericDetails;
 const canContinue=step==='occasion'?Boolean(occasion):step==='period'?Boolean(period):step==='detail'?Boolean(detail):true;
 const summary=useMemo(()=>[occasion,period&&periods.find(x=>x[0]===period)?.[1],detail].filter(Boolean).join(' · '),[occasion,period,detail]);
 const closetSet=useMemo(()=>new Set(wardrobeColors.map(norm)),[wardrobeColors]);
 const missingSelected=selected.filter(c=>!closetSet.has(norm(c)));

 useEffect(()=>{let alive=true;(async()=>{const q=new URLSearchParams(location.search);setAnchor(q.get('anchor')||'');const s=await restoreClosetSession();if(!alive)return;setSession(s);if(s){try{const rows=await loadClosetItems(s);const unique=[...new Set(rows.map((r:any)=>normalizeColor(String(r.color||''))).filter(Boolean))];setWardrobeColors(unique)}catch{}}setLoading(false)})();return()=>{alive=false}},[]);
 function next(){if(step==='occasion')setStep('period');else if(step==='period')setStep('detail');else if(step==='detail')setStep('palette');else build()}
 function back(){if(step==='period')setStep('occasion');else if(step==='detail')setStep('period');else if(step==='palette')setStep('detail');else history.back()}
 function chooseOccasion(o:QuickOccasion){setQuickOccasion(o);setCustomOccasion('');setDetail('')}
 function typeOccasion(v:string){setCustomOccasion(v);if(v.trim())setQuickOccasion(null);setDetail('')}
 function toggleColor(c:string){setAutoPalette(false);setSelected(v=>v.includes(c)?v.filter(x=>x!==c):[...v,c])}
 function chooseAuto(){setAutoPalette(true);setSelected([])}
 function build(){if(!occasion)return;const payload={occasion,period,detail,colors:selected,paletteMode:autoPalette?'auto':'selected',createdAt:new Date().toISOString()};sessionStorage.setItem('closet_stylist_context',JSON.stringify(payload));sessionStorage.setItem('closet_last_occasion',occasion);const params=new URLSearchParams({occasion});if(anchor)params.set('anchor',anchor);location.href=`/closet/look/?${params.toString()}`}

 if(loading)return <main className={styles.page}><div className={styles.loading}>Preparando seu stylist…</div></main>;
 if(!session)return <main className={styles.page}><section className={styles.empty}><span>STYLIST PESSOAL</span><h1>Entre no Closet primeiro.</h1><p>Seu guarda-roupa precisa estar conectado para montar um look.</p><button onClick={()=>location.href='/closet/'}>Voltar ao Closet</button></section></main>;
 return <main className={styles.page}>
   <header><button onClick={back}>‹</button><div><span>STYLIST PESSOAL</span><strong>{anchor?'Complete sua peça':'Seu look de hoje'}</strong></div><button onClick={()=>location.href='/closet/'}>⌂</button></header>
   <section className={styles.shell}>
    <div className={styles.progress}><div style={{width:`${progress*25}%`}}/><span>{progress} de 4</span></div>

    {step==='occasion'&&<section className={styles.step}><span>1 · MOMENTO</span><h1>O que você vai fazer?</h1><p>{anchor?'Vou manter a peça escolhida e montar o restante a partir deste contexto.':'Use um atalho ou escreva livremente. O Stylist não fica preso a uma lista de ocasiões.'}</p><div className={styles.quickOccasions}>{quickOccasions.map(o=><button key={o} className={quickOccasion===o&&!customOccasion?styles.active:''} onClick={()=>chooseOccasion(o)}>{o}</button>)}</div><div className={styles.customOccasion}><label>Ou descreva do seu jeito</label><input value={customOccasion} onChange={e=>typeOccasion(e.target.value)} placeholder="Ex.: almoço de aniversário na casa de amigos"/><small>Casamento, show, palestra, parque, ensaio, reunião, consulta… escreva o que realmente vai acontecer.</small></div></section>}

    {step==='period'&&<section className={styles.step}><span>2 · HORÁRIO</span><h1>Que horas?</h1><p>Manhã, tarde e noite ajudam o motor a ajustar peso, formalidade e leitura das cores.</p><div className={styles.options}>{periods.map(([value,label])=><button key={value} className={period===value?styles.active:''} onClick={()=>setPeriod(value)}>{label}</button>)}</div></section>}

    {step==='detail'&&<section className={styles.step}><span>3 · CONTEXTO</span><h1>Como é esse momento?</h1><p>Uma última pista para o Stylist interpretar melhor “{occasion}”.</p><div className={styles.options}>{currentDetails.map(x=><button key={x} className={detail===x?styles.active:''} onClick={()=>setDetail(x)}>{x}</button>)}</div></section>}

    {step==='palette'&&<section className={styles.step}><span>4 · PALETA DE HOJE</span><h1>Quais cores você quer usar?</h1><p>Selecione qualquer cor. O pequeno ponto indica as cores que já existem no seu Closet.</p><button className={`${styles.auto} ${autoPalette?styles.active:''}`} onClick={chooseAuto}><strong>Stylist escolhe</strong><small>Deixe o motor decidir a paleta mais harmoniosa para este momento.</small></button><div className={styles.paletteGrid}>{palette.map(([name,hex])=>{const has=closetSet.has(norm(name)),on=selected.includes(name);return <button key={name} title={`${name}${has?' · no seu Closet':' · você ainda não tem'}`} className={`${styles.swatchButton} ${on?styles.swatchActive:''}`} onClick={()=>toggleColor(name)}><i style={{background:hex}}>{on?<b>✓</b>:null}</i><span>{name}</span>{has?<small className={styles.hasDot}>•</small>:null}</button>})}</div>{!autoPalette&&<small className={styles.paletteHint}>A seleção vira uma direção real do look. Se faltar uma cor necessária, o Stylist não vai trocar silenciosamente por outra.</small>}{missingSelected.length>0&&<div className={styles.marketGap}><span>FALTA NO SEU CLOSET</span><strong>{missingSelected.join(' + ')}</strong><p>Você pode manter essas cores na intenção do look. Se faltar uma peça para completar a paleta, o Marketplace pode entrar como próxima opção.</p><a href={`/closet/marketplace/?colors=${encodeURIComponent(missingSelected.join(','))}`}>Ver no Marketplace</a></div>}</section>}

    <div className={styles.summary}><span>SEU CONTEXTO</span><strong>{summary||'Vamos definir em poucos toques.'}</strong>{step==='palette'&&<small>{autoPalette?'Paleta: Stylist escolhe':`Paleta: ${selected.length?selected.join(' + '):'sem preferência específica'}`}</small>}</div>
    <button className={styles.continue} disabled={!canContinue} onClick={next}>{step==='palette'?'Montar meu look':'Continuar'}</button>
   </section>
 </main>
}
