'use client'

import { FormEvent, useEffect, useState } from 'react'
import styles from './unified-aulas.module.css'

type Lead={id:string;status?:string;name?:string;whatsapp?:string;modality?:string;availability?:string[];flexible?:boolean;startIntent?:string}
type Student={id:string;name?:string;modality?:string;address?:string;neighborhood?:string;city?:string;day?:string;time?:string;color?:string;status?:string}
type Slot={id:string;day:string;dayOrder?:number;time:string;modality:string;status:'available'|'occupied'|'blocked';studentId?:string}

const days=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const short=['Seg','Ter','Qua','Qui','Sex','Sáb']
const blank={day:'Segunda',time:'09:00',modality:'Online',status:'available' as const}
const text=(v:unknown)=>typeof v==='string'?v:''
const norm=(v:unknown)=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const period=(time:string)=>{const h=Number((time||'00:00').split(':')[0]);return h<12?'Manhã':h<18?'Tarde':'Noite'}
const wa=(phone:unknown,msg:string)=>{const d=text(phone).replace(/\D/g,'');if(!d)return '#';return `https://wa.me/${d.startsWith('55')?d:`55${d}`}?text=${encodeURIComponent(msg)}`}

function score(lead:Lead,slot:Slot){
  const lm=norm(lead.modality),sm=norm(slot.modality)
  if(!(sm.includes('online ou presencial')||lm.includes('duas')||lm.includes('ambas')||lm===sm))return 0
  const target=norm(`${slot.day} - ${period(slot.time)}`)
  const availability=Array.isArray(lead.availability)?lead.availability:[]
  let best=0
  for(const raw of availability.slice(0,30)){
    const [w='',d='']=String(raw).split('|').map(x=>x.trim())
    const nw=norm(w),nd=norm(d)
    if(nw===target&&nd===norm(slot.time))best=Math.max(best,95)
    else if(nw===target&&nd.includes('qualquer'))best=Math.max(best,88)
    else if(nw===target)best=Math.max(best,72)
    else if(nw.startsWith(norm(slot.day))&&lead.flexible)best=Math.max(best,55)
  }
  if(norm(lead.startIntent)==='imediatamente')best=Math.min(100,best+5)
  return best
}

export default function AgendaOnlyManager(){
  const [students,setStudents]=useState<Student[]>([])
  const [slots,setSlots]=useState<Slot[]>([])
  const [leads,setLeads]=useState<Lead[]>([])
  const [day,setDay]=useState('Segunda')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [opening,setOpening]=useState(false)
  const [newSlot,setNewSlot]=useState({...blank})
  const [selected,setSelected]=useState<Slot|null>(null)
  const [matches,setMatches]=useState<{lead:Lead;score:number}[]>([])

  async function load(){
    const controller=new AbortController()
    const timer=setTimeout(()=>controller.abort(),12000)
    try{
      const [a,b]=await Promise.all([
        fetch('/api/admin/aulas',{cache:'no-store',signal:controller.signal}),
        fetch('/api/admin/alunos',{cache:'no-store',signal:controller.signal})
      ])
      if(a.ok){const d=await a.json();setSlots(Array.isArray(d.slots)?d.slots:[]);setLeads(Array.isArray(d.leads)?d.leads:[])}
      if(b.ok){const d=await b.json();setStudents(Array.isArray(d.students)?d.students:[])}
    }catch(err:any){setError(err?.name==='AbortError'?'A gestão demorou demais para responder. Atualize a página.':'Não foi possível carregar a agenda.')}
    finally{clearTimeout(timer);setLoading(false)}
  }
  useEffect(()=>{load()},[])

  async function post(payload:any){const r=await fetch('/api/admin/aulas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return r.ok}
  async function addSlot(e:FormEvent){e.preventDefault();const slot={...newSlot,dayOrder:days.indexOf(newSlot.day)+1};if(await post({action:'saveSlot',slot})){setOpening(false);setDay(newSlot.day);setNewSlot({...blank});setLoading(true);await load()}}
  async function updateStatus(status:Slot['status']){if(!selected)return;const next={...selected,status};if(await post({action:'saveSlot',slot:next})){setSlots(v=>v.map(s=>s.id===next.id?next:s));setSelected(next)}}
  async function remove(){if(!selected||!confirm(`Remover ${selected.day} ${selected.time}?`))return;if(await post({action:'deleteSlot',id:selected.id})){setSlots(v=>v.filter(s=>s.id!==selected.id));setSelected(null)}}
  function inspect(slot:Slot){const waiting=leads.filter(l=>['waiting','contacted','offered'].includes(text(l.status)));setMatches(waiting.map(lead=>({lead,score:score(lead,slot)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score));setSelected(slot)}

  const active=students.filter(s=>s.status==='active')
  const open=slots.filter(s=>s.status==='available'&&!s.studentId)
  const waiting=leads.filter(l=>['waiting','contacted','offered'].includes(text(l.status)))
  const items=[
    ...active.filter(s=>s.day===day).map(s=>({kind:'student' as const,time:text(s.time),student:s})),
    ...slots.filter(s=>s.day===day&&!s.studentId).map(s=>({kind:'slot' as const,time:text(s.time),slot:s}))
  ].sort((a,b)=>a.time.localeCompare(b.time))

  return <main className={styles.page}>
    <header className={styles.top}><div><span>FOCO EM CANTO</span><h1>Gestão de Aulas</h1></div><div className={styles.topActions}><a href="/aulasindividuais/" target="_blank">Página pública ↗</a><a href="/gestao/aulas/alunos/">+ Cadastrar aluno</a></div></header>
    <div className={styles.shell}>
      <section className={styles.stats}><div><small>Alunos ativos</small><strong>{active.length}</strong></div><div><small>Vagas abertas</small><strong>{open.length}</strong></div><div><small>Lista de interesse</small><strong>{waiting.length}</strong></div></section>
      <nav className={styles.tabs} style={{display:'flex',gap:8}}><a href="/gestao/aulas/" className={styles.active}>Agenda</a><a href="/gestao/aulas/alunos/">Alunos</a><a href="/gestao/aulas/interesse/">Lista de interesse</a></nav>
      {loading?<div className={styles.loading}>Carregando agenda...</div>:error?<div className={styles.error}>{error}</div>:<>
        <div className={styles.sectionBar}><div><h2>Agenda semanal</h2><p>Alunos e vagas organizados em ordem cronológica.</p></div><button onClick={()=>{setNewSlot({...blank,day});setOpening(true)}}>+ Abrir vaga</button></div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>{days.map((d,i)=><button key={d} onClick={()=>setDay(d)} style={{padding:'10px 14px',borderRadius:10,border:'1px solid rgba(255,255,255,.1)',background:day===d?'#efcc89':'#12171d',color:day===d?'#17120b':'#aab2bc',fontWeight:800,cursor:'pointer'}}>{short[i]}</button>)}</div>
        <section className={styles.agenda} style={{gridTemplateColumns:'1fr'}}><article className={styles.day}><div className={styles.dayHead}><h2>{day}</h2><span>{items.length} item{items.length===1?'':'s'}</span></div><div className={styles.events}>{items.map(item=>item.kind==='student'?<a href="/gestao/aulas/alunos/" key={`s-${item.student.id}`} className={styles.event} style={{background:text(item.student.color)||'#7427b9',textDecoration:'none'}}><div className={styles.time}>{item.time||'--:--'}</div><div className={styles.eventBody}><strong>{text(item.student.name)||'Aluno'}</strong><span>{text(item.student.modality)||'Online'}{item.student.neighborhood?` • ${item.student.neighborhood}`:''}</span><small>{text(item.student.address)}</small></div><div className={styles.chevron}>›</div></a>:<button key={`v-${item.slot.id}`} className={`${styles.event} ${item.slot.status==='available'?styles.vacancy:''}`} style={item.slot.status==='occupied'?{background:'#222832'}:item.slot.status==='blocked'?{background:'#181b20'}:undefined} onClick={()=>inspect(item.slot)}><div className={styles.time}>{item.time}</div><div className={styles.eventBody}><strong>{item.slot.status==='available'?'Vaga disponível':item.slot.status==='occupied'?'Horário ocupado':'Horário bloqueado'}</strong><span>{item.slot.modality}</span><small>Clique para gerenciar</small></div><div className={styles.chevron}>›</div></button>)}{!items.length&&<div className={styles.emptyDay}>Nenhuma aula ou vaga neste dia.</div>}</div></article></section>
      </>}
    </div>

    {opening&&<div className={styles.backdrop} onClick={()=>setOpening(false)}><form className={styles.modal} onSubmit={addSlot} onClick={e=>e.stopPropagation()}><div className={styles.modalHead}><div><span>NOVO HORÁRIO</span><h2>Abrir vaga</h2></div><button type="button" onClick={()=>setOpening(false)}>×</button></div><div className={styles.formGrid}><label>Dia<select value={newSlot.day} onChange={e=>setNewSlot(v=>({...v,day:e.target.value}))}>{days.map(d=><option key={d}>{d}</option>)}</select></label><label>Horário<input type="time" value={newSlot.time} onChange={e=>setNewSlot(v=>({...v,time:e.target.value}))}/></label><label>Modalidade<select value={newSlot.modality} onChange={e=>setNewSlot(v=>({...v,modality:e.target.value}))}><option>Online</option><option>Presencial</option><option>Online ou Presencial</option></select></label><label>Status<select value={newSlot.status} onChange={e=>setNewSlot(v=>({...v,status:e.target.value as Slot['status']}))}><option value="available">Disponível</option><option value="occupied">Ocupado</option><option value="blocked">Bloqueado</option></select></label></div><div className={styles.modalActions}><button type="button" onClick={()=>setOpening(false)}>Cancelar</button><button className={styles.save}>Adicionar horário</button></div></form></div>}

    {selected&&<div className={styles.backdrop} onClick={()=>setSelected(null)}><div className={styles.modal} onClick={e=>e.stopPropagation()}><div className={styles.modalHead}><div><span>HORÁRIO</span><h2>{selected.day} • {selected.time}</h2></div><button onClick={()=>setSelected(null)}>×</button></div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:18}}><button onClick={()=>updateStatus('available')}>Disponível</button><button onClick={()=>updateStatus('occupied')}>Ocupado</button><button onClick={()=>updateStatus('blocked')}>Bloqueado</button><button onClick={remove}>Remover</button></div>{selected.status==='available'&&<div className={styles.matches}>{matches.map(({lead,score})=>{const name=text(lead.name)||'Interessado';return <article key={lead.id}><b>{score}%</b><div><strong>{name}</strong><span>{Array.isArray(lead.availability)?lead.availability.join(' • '):''}</span></div>{lead.whatsapp&&<a href={wa(lead.whatsapp,`Oi, ${name.split(' ')[0]}! Tudo bem? Aqui é o Marcos Cruz 😊 Surgiu uma vaga ${selected.modality==='Online ou Presencial'?'online ou presencial':selected.modality.toLowerCase()} na ${selected.day.toLowerCase()}, às ${selected.time}. Você ainda tem interesse?`)} target="_blank">Oferecer vaga</a>}</article>})}{!matches.length&&<div className={styles.bigEmpty}>Nenhum candidato compatível.</div>}</div>}</div></div>}
  </main>
}
