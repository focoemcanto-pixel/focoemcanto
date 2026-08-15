'use client'

import { FormEvent, useEffect, useState } from 'react'
import styles from './unified-aulas.module.css'

type Lead={id:string;status?:string;name?:string;whatsapp?:string;modality?:string;availability?:string[];flexible?:boolean;startIntent?:string;goal?:string}
type Student={id:string;name?:string;whatsapp?:string;email?:string;modality?:string;address?:string;neighborhood?:string;city?:string;day?:string;time?:string;monthlyValue?:string;paymentDay?:string;notes?:string;color?:string;status?:string}
type Slot={id:string;day:string;dayOrder?:number;time:string;modality:string;status:'available'|'occupied'|'blocked';studentId?:string}

const days=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const palette=['#7427b9','#4f1b93','#236da0','#168c8c','#26784d','#6d7f2b','#aa7220','#b85620','#ad386f','#873044']
const blankStudent={name:'',whatsapp:'',email:'',modality:'Online',address:'',neighborhood:'',city:'Salvador',day:'Segunda',time:'09:00',monthlyValue:'',paymentDay:'',notes:'',color:'#7427b9',status:'active'}
const blankSlot={day:'Segunda',time:'09:00',modality:'Online',status:'available' as const}

const txt=(v:unknown)=>typeof v==='string'?v:''
const norm=(v:unknown)=>txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const period=(time:string)=>{const h=Number((time||'00:00').split(':')[0]);return h<12?'Manhã':h<18?'Tarde':'Noite'}
const wa=(phone:unknown,msg:string)=>{const d=txt(phone).replace(/\D/g,'');if(!d)return '#';const p=d.startsWith('55')?d:`55${d}`;return `https://wa.me/${p}?text=${encodeURIComponent(msg)}`}

function score(lead:Lead,slot:Slot){
  const lm=norm(lead.modality), sm=norm(slot.modality)
  const modalityOk=sm.includes('online ou presencial')||lm.includes('duas')||lm.includes('ambas')||lm===sm
  if(!modalityOk)return 0
  const target=norm(`${slot.day} - ${period(slot.time)}`)
  const av=Array.isArray(lead.availability)?lead.availability:[]
  let best=0
  for(const raw of av){
    const [w='',d='']=raw.split('|').map(x=>x.trim())
    const nw=norm(w), nd=norm(d)
    if(nw===target&&nd===norm(slot.time))best=Math.max(best,95)
    else if(nw===target&&nd.includes('qualquer'))best=Math.max(best,88)
    else if(nw===target)best=Math.max(best,75)
    else if(nw.startsWith(norm(slot.day))&&lead.flexible)best=Math.max(best,55)
  }
  if(norm(lead.startIntent)==='imediatamente')best=Math.min(100,best+5)
  return best
}

export default function UnifiedAulasManagerV4(){
  const [tab,setTab]=useState<'agenda'|'alunos'|'interesse'>('agenda')
  const [students,setStudents]=useState<Student[]>([])
  const [leads,setLeads]=useState<Lead[]>([])
  const [slots,setSlots]=useState<Slot[]>([])
  const [loading,setLoading]=useState(true)
  const [editing,setEditing]=useState<Partial<Student>|null>(null)
  const [opening,setOpening]=useState(false)
  const [newSlot,setNewSlot]=useState({...blankSlot})
  const [selected,setSelected]=useState<Slot|null>(null)
  const [matches,setMatches]=useState<{lead:Lead;score:number}[]>([])
  const [error,setError]=useState('')

  async function fetchAll(){
    const [a,b]=await Promise.all([fetch('/api/admin/aulas',{cache:'no-store'}),fetch('/api/admin/alunos',{cache:'no-store'})])
    if(a.ok){const d=await a.json();setLeads(Array.isArray(d.leads)?d.leads:[]);setSlots(Array.isArray(d.slots)?d.slots:[])}
    if(b.ok){const d=await b.json();setStudents(Array.isArray(d.students)?d.students:[])}
  }
  useEffect(()=>{let alive=true;(async()=>{try{await fetchAll()}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[])

  const active=students.filter(s=>s?.status==='active')
  const waiting=leads.filter(l=>['waiting','contacted','offered'].includes(txt(l?.status)))
  const openSlots=slots.filter(s=>s?.status==='available'&&!s.studentId)

  function openCandidates(slot:Slot){
    const ranked=waiting.map(lead=>({lead,score:score(lead,slot)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)
    setMatches(ranked);setSelected(slot)
  }

  async function api(payload:any){
    const r=await fetch('/api/admin/aulas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    if(!r.ok){const d=await r.json().catch(()=>({}));setError(d.error||'Não foi possível salvar.');return false}
    setError('');return true
  }
  async function studentApi(payload:any){
    const r=await fetch('/api/admin/alunos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    if(!r.ok){const d=await r.json().catch(()=>({}));setError(d.error||'Não foi possível salvar.');return false}
    setError('');return true
  }

  async function saveStudent(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!editing)return
    const f=new FormData(e.currentTarget);const day=String(f.get('day')||'Segunda')
    const student={...editing,...Object.fromEntries(f.entries()),dayOrder:days.indexOf(day)+1,color:editing.color||'#7427b9',status:'active'}
    if(await studentApi({action:'save',student})){setEditing(null);await fetchAll()}
  }
  async function releaseStudent(s:Student){if(!confirm(`Liberar o horário de ${txt(s.name)||'este aluno'}?`))return;if(await studentApi({action:'release',id:s.id}))await fetchAll()}
  async function addSlot(e:FormEvent){e.preventDefault();const slot={...newSlot,dayOrder:days.indexOf(newSlot.day)+1};if(await api({action:'saveSlot',slot})){setOpening(false);setNewSlot({...blankSlot});await fetchAll()}}
  async function changeSlot(slot:Slot,status:Slot['status']){const old=slots;setSlots(v=>v.map(x=>x.id===slot.id?{...x,status}:x));if(!(await api({action:'saveSlot',slot:{...slot,status}})))setSlots(old)}
  async function deleteSlot(slot:Slot){if(!confirm(`Remover ${slot.day} ${slot.time}?`))return;const old=slots;setSlots(v=>v.filter(x=>x.id!==slot.id));if(!(await api({action:'deleteSlot',id:slot.id})))setSlots(old)}

  if(loading)return <main className={styles.page}><div className={styles.loading}>Carregando sua gestão...</div></main>

  return <main className={styles.page}>
    <header className={styles.top}><div><span>FOCO EM CANTO</span><h1>Gestão de Aulas</h1></div><div className={styles.topActions}><a href="/aulasindividuais" target="_blank">Página pública ↗</a><button onClick={()=>setEditing({...blankStudent})}>+ Cadastrar aluno</button></div></header>
    <div className={styles.shell}>
      <section className={styles.stats}><div><small>Alunos ativos</small><strong>{active.length}</strong></div><div><small>Vagas abertas</small><strong>{openSlots.length}</strong></div><div><small>Lista de interesse</small><strong>{waiting.length}</strong></div></section>
      <nav className={styles.tabs}><button className={tab==='agenda'?styles.active:''} onClick={()=>setTab('agenda')}>Agenda</button><button className={tab==='alunos'?styles.active:''} onClick={()=>setTab('alunos')}>Alunos</button><button className={tab==='interesse'?styles.active:''} onClick={()=>setTab('interesse')}>Lista de interesse</button></nav>

      {tab==='agenda'&&<><div className={styles.sectionBar}><div><h2>Agenda semanal</h2><p>Alunos e vagas em ordem cronológica.</p></div><button onClick={()=>setOpening(true)}>+ Abrir vaga</button></div><section className={styles.agenda}>{days.map(day=>{
        const items=[...active.filter(s=>txt(s.day)===day).map(s=>({kind:'student',time:txt(s.time),student:s})),...slots.filter(s=>s.day===day&&!s.studentId).map(s=>({kind:'slot',time:s.time,slot:s}))].sort((a,b)=>a.time.localeCompare(b.time)) as any[]
        return <article className={styles.day} key={day}><div className={styles.dayHead}><h2>{day}</h2><span>{items.length} item{items.length===1?'':'s'}</span></div><div className={styles.events}>{items.map((item:any)=>item.kind==='student'?<button key={`s-${item.student.id}`} className={styles.event} style={{background:txt(item.student.color)||'#7427b9'}} onClick={()=>setEditing({...item.student})}><div className={styles.time}>{item.time||'--:--'}</div><div className={styles.eventBody}><strong>{txt(item.student.name)||'Aluno'}</strong><span>{txt(item.student.modality)||'Online'}{item.student.neighborhood?` • ${item.student.neighborhood}`:''}</span><small>{item.student.address||''}</small></div><div className={styles.chevron}>›</div></button>:<div key={`v-${item.slot.id}`} className={`${styles.event} ${item.slot.status==='available'?styles.vacancy:''}`} style={item.slot.status==='occupied'?{background:'#222832'}:item.slot.status==='blocked'?{background:'#181b20'}:undefined}><div className={styles.time}>{item.time}</div><div className={styles.eventBody} onClick={()=>item.slot.status==='available'&&openCandidates(item.slot)} style={{cursor:item.slot.status==='available'?'pointer':'default'}}><strong>{item.slot.status==='available'?'Vaga disponível':item.slot.status==='occupied'?'Horário ocupado':'Horário bloqueado'}</strong><span>{item.slot.modality}</span><small>{item.slot.status==='available'?'Ver candidatos compatíveis':'Status manual'}</small></div><div style={{display:'flex',gap:6,alignItems:'center'}}><select value={item.slot.status} onChange={e=>changeSlot(item.slot,e.target.value as Slot['status'])} style={{height:36,borderRadius:9,background:'#161c23',color:'#fff',border:'1px solid #333'}}><option value="available">Disponível</option><option value="occupied">Ocupado</option><option value="blocked">Bloqueado</option></select><button type="button" onClick={()=>deleteSlot(item.slot)} style={{height:36,width:36,borderRadius:9,background:'#31191d',color:'#f0a4ae',border:0}}>×</button></div></div>)}{!items.length&&<div className={styles.emptyDay}>Nenhuma aula ou vaga cadastrada.</div>}</div></article>})}</section></>}

      {tab==='alunos'&&<section className={styles.studentList}><div className={styles.sectionBar}><div><h2>Seus alunos</h2><p>Cadastros e horários fixos.</p></div><button onClick={()=>setEditing({...blankStudent})}>+ Novo aluno</button></div>{students.map(s=><article className={styles.studentCard} key={s.id}><div className={styles.avatar} style={{background:s.color||'#242c36'}}>{(s.name||'A').charAt(0).toUpperCase()}</div><div className={styles.studentMain}><strong>{s.name||'Aluno'}</strong><span>{s.day||'-'} • {s.time||'--:--'} • {s.modality||'Online'}</span><small>{s.modality==='Presencial'?[s.address,s.neighborhood,s.city].filter(Boolean).join(', '):'Aula online'}</small></div><div className={styles.studentMeta}><span>{s.monthlyValue?`R$ ${s.monthlyValue}`:'Valor não informado'}</span><span>{s.paymentDay?`Venc. dia ${s.paymentDay}`:'Sem vencimento'}</span></div><div className={styles.actions}>{s.whatsapp&&<a href={wa(s.whatsapp,`Oi, ${(s.name||'').split(' ')[0]}! Tudo bem? Aqui é o Marcos 😊`)} target="_blank">WhatsApp</a>}<button onClick={()=>setEditing({...s})}>Editar</button>{s.status==='active'&&<button className={styles.release} onClick={()=>releaseStudent(s)}>Liberar vaga</button>}</div></article>)}</section>}

      {tab==='interesse'&&<section className={styles.leads}><div className={styles.sectionBar}><div><h2>Lista de interesse</h2><p>Cadastros recebidos pela página pública.</p></div></div>{leads.map(l=><article className={styles.leadCard} key={l.id}><div><strong>{l.name||'Interessado'}</strong><span>{l.modality||'Modalidade não informada'} • {l.startIntent||'início não informado'}</span><small>{Array.isArray(l.availability)?l.availability.join(' • '):'Disponibilidade não informada'}</small></div><div className={styles.goal}>{l.goal||'Objetivo não informado'}</div>{l.whatsapp&&<a href={wa(l.whatsapp,`Oi, ${(l.name||'').split(' ')[0]}! Tudo bem? Aqui é o Marcos 😊`)} target="_blank">WhatsApp</a>}</article>)}</section>}
    </div>

    {editing&&<div className={styles.backdrop} onClick={()=>setEditing(null)}><form className={styles.modal} onSubmit={saveStudent} onClick={e=>e.stopPropagation()}><div className={styles.modalHead}><div><span>FICHA DO ALUNO</span><h2>{editing.id?'Editar aluno':'Cadastrar aluno'}</h2></div><button type="button" onClick={()=>setEditing(null)}>×</button></div><div className={styles.formGrid}><label>Nome *<input name="name" required defaultValue={txt(editing.name)}/></label><label>WhatsApp<input name="whatsapp" defaultValue={txt(editing.whatsapp)}/></label><label>E-mail<input name="email" defaultValue={txt(editing.email)}/></label><label>Modalidade<select name="modality" defaultValue={txt(editing.modality)||'Online'}><option>Online</option><option>Presencial</option></select></label><label>Dia<select name="day" defaultValue={txt(editing.day)||'Segunda'}>{days.map(d=><option key={d}>{d}</option>)}</select></label><label>Horário<input name="time" type="time" required defaultValue={txt(editing.time)||'09:00'}/></label><label>Mensalidade<input name="monthlyValue" defaultValue={txt(editing.monthlyValue)}/></label><label>Dia do pagamento<input name="paymentDay" defaultValue={txt(editing.paymentDay)}/></label><label className={styles.full}>Endereço<input name="address" defaultValue={txt(editing.address)}/></label><label>Bairro<input name="neighborhood" defaultValue={txt(editing.neighborhood)}/></label><label>Cidade<input name="city" defaultValue={txt(editing.city)||'Salvador'}/></label><div className={styles.full}><span>Cor da faixa</span><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>{palette.map(c=><button type="button" key={c} onClick={()=>setEditing(v=>v?{...v,color:c}:v)} style={{width:30,height:30,borderRadius:99,background:c,border:editing.color===c?'3px solid white':'1px solid #555'}} />)}</div></div><label className={styles.full}>Observações<textarea name="notes" rows={3} defaultValue={txt(editing.notes)}/></label></div>{error&&<div className={styles.error}>{error}</div>}<div className={styles.modalActions}><button type="button" onClick={()=>setEditing(null)}>Cancelar</button><button className={styles.save}>Salvar aluno</button></div></form></div>}

    {opening&&<div className={styles.backdrop} onClick={()=>setOpening(false)}><form className={styles.modal} onSubmit={addSlot} onClick={e=>e.stopPropagation()}><div className={styles.modalHead}><div><span>NOVO HORÁRIO</span><h2>Abrir vaga</h2></div><button type="button" onClick={()=>setOpening(false)}>×</button></div><div className={styles.formGrid}><label>Dia<select value={newSlot.day} onChange={e=>setNewSlot(v=>({...v,day:e.target.value}))}>{days.map(d=><option key={d}>{d}</option>)}</select></label><label>Horário<input type="time" value={newSlot.time} onChange={e=>setNewSlot(v=>({...v,time:e.target.value}))}/></label><label>Modalidade<select value={newSlot.modality} onChange={e=>setNewSlot(v=>({...v,modality:e.target.value}))}><option>Online</option><option>Presencial</option><option>Online ou Presencial</option></select></label><label>Status<select value={newSlot.status} onChange={e=>setNewSlot(v=>({...v,status:e.target.value as Slot['status']}))}><option value="available">Disponível</option><option value="occupied">Ocupado</option><option value="blocked">Bloqueado</option></select></label></div>{error&&<div className={styles.error}>{error}</div>}<div className={styles.modalActions}><button type="button" onClick={()=>setOpening(false)}>Cancelar</button><button className={styles.save}>Adicionar horário</button></div></form></div>}

    {selected&&<div className={styles.backdrop} onClick={()=>setSelected(null)}><div className={styles.modal} onClick={e=>e.stopPropagation()}><div className={styles.modalHead}><div><span>CANDIDATOS COMPATÍVEIS</span><h2>{selected.day} • {selected.time}</h2></div><button onClick={()=>setSelected(null)}>×</button></div><div className={styles.matches}>{matches.map(({lead,score})=><article key={lead.id}><b>{score}%</b><div><strong>{lead.name||'Interessado'}</strong><span>{Array.isArray(lead.availability)?lead.availability.join(' • '):''}</span></div>{lead.whatsapp&&<a href={wa(lead.whatsapp,`Oi, ${(lead.name||'').split(' ')[0]}! Tudo bem? Aqui é o Marcos Cruz 😊 Surgiu uma vaga na ${selected.day.toLowerCase()}, às ${selected.time}. Você ainda tem interesse?`)} target="_blank">Oferecer vaga</a>}</article>)}{!matches.length&&<div className={styles.bigEmpty}>Nenhum candidato compatível com este horário.</div>}</div></div></div>}
  </main>
}
