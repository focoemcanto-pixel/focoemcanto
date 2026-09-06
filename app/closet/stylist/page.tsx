'use client';

import {useEffect,useMemo,useState} from 'react';
import {loadClosetItems,restoreClosetSession,type ClosetSession} from '../supabase';
import styles from './stylist.module.css';

type Step='occasion'|'period'|'detail'|'palette';
type Occasion='Igreja'|'Trabalho'|'Escola'|'Faculdade'|'Encontro'|'Festa'|'Evento'|'Sair'|'Viagem';

const occasions:Occasion[]=['Igreja','Trabalho','Escola','Faculdade','Encontro','Festa','Evento','Sair','Viagem'];
const details:Record<Occasion,string[]>={
 Igreja:['Culto comum','Ministrar / servir','Evento especial'],
 Trabalho:['Dia normal','Reunião importante','Evento profissional'],
 Escola:['Dia normal','Apresentação / evento'],
 Faculdade:['Aula comum','Apresentação / seminário','Evento'],
 Encontro:['Casual','Jantar','Especial / mais arrumado'],
 Festa:['Casual','Arrumada','Formal'],
 Evento:['Casual arrumado','Cerimônia','Formal'],
 Sair:['Passeio casual','Almoço / shopping','Jantar / noite'],
 Viagem:['Deslocamento','Passeio','Jantar / evento']
};
const periods=[['manha','Manhã'],['tarde','Tarde'],['noite','Noite']] as const;

function normalizeColor(v:string){return v.trim().replace(/\s+/g,' ')}
function colorSwatch(name:string){const n=name.toLowerCase();if(n.includes('preto'))return'#1f1f1f';if(n.includes('branco'))return'#f7f5ef';if(n.includes('off'))return'#eee8d8';if(n.includes('bege')||n.includes('creme'))return'#d7c4a7';if(n.includes('marrom')||n.includes('caramelo'))return'#805c40';if(n.includes('azul marinho')||n.includes('azul-marinho'))return'#27384f';if(n.includes('azul'))return'#5f84a8';if(n.includes('verde'))return'#62765b';if(n.includes('cinza')||n.includes('grafite'))return'#777773';if(n.includes('vinho'))return'#6f3840';if(n.includes('vermelho'))return'#a34a44';if(n.includes('rosa'))return'#c98f98';if(n.includes('amarelo'))return'#c8a54a';if(n.includes('roxo')||n.includes('lilás'))return'#8a7190';return'#b69e82'}

export default function StylistSetup(){
 const [session,setSession]=useState<ClosetSession|null>(null),[loading,setLoading]=useState(true),[step,setStep]=useState<Step>('occasion'),[anchor,setAnchor]=useState('');
 const [occasion,setOccasion]=useState<Occasion|null>(null),[period,setPeriod]=useState(''),[detail,setDetail]=useState(''),[colors,setColors]=useState<string[]>([]),[selected,setSelected]=useState<string[]>([]),[autoPalette,setAutoPalette]=useState(true);
 const progress=step==='occasion'?1:step==='period'?2:step==='detail'?3:4;
 const currentDetails=occasion?details[occasion]:[];
 const canContinue=step==='occasion'?Boolean(occasion):step==='period'?Boolean(period):step==='detail'?Boolean(detail):true;
 const summary=useMemo(()=>[occasion,period&&periods.find(x=>x[0]===period)?.[1],detail].filter(Boolean).join(' · '),[occasion,period,detail]);
 useEffect(()=>{let alive=true;(async()=>{const q=new URLSearchParams(location.search);setAnchor(q.get('anchor')||'');const s=await restoreClosetSession();if(!alive)return;setSession(s);if(s){try{const rows=await loadClosetItems(s);const unique=[...new Set(rows.map((r:any)=>normalizeColor(String(r.color||''))).filter(Boolean))];setColors(unique.slice(0,18))}catch{}}setLoading(false)})();return()=>{alive=false}},[]);
 function next(){if(step==='occasion')setStep('period');else if(step==='period')setStep('detail');else if(step==='detail')setStep('palette');else build()}
 function back(){if(step==='period')setStep('occasion');else if(step==='detail')setStep('period');else if(step==='palette')setStep('detail');else history.back()}
 function chooseOccasion(o:Occasion){setOccasion(o);setDetail('')}
 function toggleColor(c:string){setAutoPalette(false);setSelected(v=>v.includes(c)?v.filter(x=>x!==c):[...v,c])}
 function chooseAuto(){setAutoPalette(true);setSelected([])}
 function build(){if(!occasion)return;const payload={occasion,period,detail,colors:selected,paletteMode:autoPalette?'auto':'selected',createdAt:new Date().toISOString()};sessionStorage.setItem('closet_stylist_context',JSON.stringify(payload));sessionStorage.setItem('closet_last_occasion',occasion);const params=new URLSearchParams({occasion});if(anchor)params.set('anchor',anchor);location.href=`/closet/look/?${params.toString()}`}
 if(loading)return <main className={styles.page}><div className={styles.loading}>Preparando seu stylist…</div></main>;
 if(!session)return <main className={styles.page}><section className={styles.empty}><span>STYLIST PESSOAL</span><h1>Entre no Closet primeiro.</h1><p>Seu guarda-roupa precisa estar conectado para montar um look.</p><button onClick={()=>location.href='/closet/'}>Voltar ao Closet</button></section></main>;
 return <main className={styles.page}>
   <header><button onClick={back}>‹</button><div><span>STYLIST PESSOAL</span><strong>{anchor?'Complete sua peça':'Seu look de hoje'}</strong></div><button onClick={()=>location.href='/closet/'}>⌂</button></header>
   <section className={styles.shell}>
    <div className={styles.progress}><div style={{width:`${progress*25}%`}}/><span>{progress} de 4</span></div>
    {step==='occasion'&&<section className={styles.step}><span>1 · OCASIÃO</span><h1>Para onde você vai?</h1><p>{anchor?'Vou manter a peça escolhida e montar o restante a partir deste contexto.':'Isso define a base do look.'}</p><div className={styles.options}>{occasions.map(o=><button key={o} className={occasion===o?styles.active:''} onClick={()=>chooseOccasion(o)}>{o==='Sair'?'Passeio / sair':o}</button>)}</div></section>}
    {step==='period'&&<section className={styles.step}><span>2 · HORÁRIO</span><h1>Que horas?</h1><p>Manhã, tarde e noite mudam o peso, a formalidade e até as cores que funcionam melhor.</p><div className={styles.options}>{periods.map(([value,label])=><button key={value} className={period===value?styles.active:''} onClick={()=>setPeriod(value)}>{label}</button>)}</div></section>}
    {step==='detail'&&<section className={styles.step}><span>3 · CONTEXTO</span><h1>Como é esse momento?</h1><p>Uma última pista para o Stylist não tratar todos os eventos do mesmo jeito.</p><div className={styles.options}>{currentDetails.map(x=><button key={x} className={detail===x?styles.active:''} onClick={()=>setDetail(x)}>{x}</button>)}</div></section>}
    {step==='palette'&&<section className={styles.step}><span>4 · PALETA DE HOJE</span><h1>Quais cores você quer usar?</h1><p>Escolha livremente as cores do seu Closet. Não são combinações prontas — você monta a direção da paleta.</p><button className={`${styles.auto} ${autoPalette?styles.active:''}`} onClick={chooseAuto}><strong>Stylist escolhe</strong><small>Deixe o motor decidir a paleta mais harmoniosa para esse momento.</small></button>{colors.length?<div className={styles.colors}>{colors.map(c=><button key={c} className={selected.includes(c)?styles.colorActive:''} onClick={()=>toggleColor(c)}><i style={{background:colorSwatch(c)}}/><span>{c}</span>{selected.includes(c)&&<b>✓</b>}</button>)}</div>:<div className={styles.noColors}>Cadastre cores nas peças para liberar a seleção de paleta. Por enquanto o Stylist escolhe automaticamente.</div>} {!autoPalette&&<small className={styles.paletteHint}>O motor prioriza suas cores, mas pode usar neutros complementares para manter o look completo e harmonioso.</small>}</section>}
    <div className={styles.summary}><span>SEU CONTEXTO</span><strong>{summary||'Vamos definir em poucos toques.'}</strong>{step==='palette'&&<small>{autoPalette?'Paleta: Stylist escolhe':`Paleta: ${selected.length?selected.join(' + '):'sem preferência específica'}`}</small>}</div>
    <button className={styles.continue} disabled={!canContinue} onClick={next}>{step==='palette'?'Montar meu look':'Continuar'}</button>
   </section>
 </main>
}
