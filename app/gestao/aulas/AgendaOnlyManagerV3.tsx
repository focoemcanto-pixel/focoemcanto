'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import styles from './unified-aulas.module.css'

type Lead={id:string;status?:string;name?:string;whatsapp?:string;modality?:string;availability?:string[];flexible?:boolean;startIntent?:string;createdAt?:string;offeredAt?:string;contactedAt?:string}
type Student={id:string;name?:string;modality?:string;address?:string;neighborhood?:string;city?:string;day?:string;dayOrder?:number;time?:string;durationMinutes?:number;weeklyFrequency?:number;secondDay?:string;secondDayOrder?:number;secondTime?:string;color?:string;status?:string;monthlyValue?:string}
type Slot={id:string;day:string;dayOrder?:number;time:string;durationMinutes?:number;modality:string;status:'available'|'occupied'|'blocked';studentId?:string}
type Opportunity={kind:'money'|'match'|'demand'|'route'|'gap';title:string;detail:string;day?:string;leadId?:string;score?:number}
type ModalityFilter='Todas'|'Online'|'Presencial'
type StudentOccurrence={key:string;student:Student;day:string;time:string;durationMinutes:number}

const days=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const short=['Seg','Ter','Qua','Qui','Sex','Sáb']
const blank={day:'Segunda',time:'09:00',durationMinutes:60,modality:'Online',status:'available' as const}
const text=(v:unknown)=>typeof v==='string'?v:''
const norm=(v:unknown)=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const period=(time:string)=>{const h=Number((time||'00:00').split(':')[0]);return h<12?'Manhã':h<18?'Tarde':'Noite'}
const wa=(phone:unknown,msg:string)=>{const raw=text(phone).trim();const d=raw.replace(/\D/g,'');if(!d)return '#';const p=raw.startsWith('+')?d:(d.startsWith('55')?d:`55${d}`);return `https://wa.me/${p}?text=${encodeURIComponent(msg)}`}
const minutes=(time?:string)=>{const [h,m]=text(time).split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:0}
const safeDuration=(value?:number)=>{const n=Number(value||60);return Number.isFinite(n)&&n>0?n:60}
const clock=(total:number)=>`${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`
const endTime=(time?:string,duration?:number)=>clock(minutes(time)+safeDuration(duration))
const durationLabel=(value?:number)=>{const n=safeDuration(value);if(n<60)return `${n} min`;const h=Math.floor(n/60),m=n%60;return `${h}h${m?`${m}min`:''}`}
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value)

function modalityMatches(value:unknown,filter:ModalityFilter){if(filter==='Todas')return true;const n=norm(value);return n.includes(norm(filter))||n.includes('online ou presencial')||n.includes('duas')||n.includes('ambas')}
function score(lead:Lead,slot:Slot){
  const lm=norm(lead.modality),sm=norm(slot.modality)
  if(!(sm.includes('online ou presencial')||lm.includes('duas')||lm.includes('ambas')||lm.includes(sm)||sm.includes(lm)))return 0
  const target=norm(`${slot.day} - ${period(slot.time)}`)
  const availability=Array.isArray(lead.availability)?lead.availability:[]
  let best=0
  for(const raw of availability.slice(0,30)){
    const [w='',d='']=String(raw).split('|').map(x=>x.trim());const nw=norm(w),nd=norm(d)
    if(nw===target&&nd===norm(slot.time))best=Math.max(best,100)
    else if(nw===target&&nd.includes('qualquer'))best=Math.max(best,94)
    else if(nw===target)best=Math.max(best,82)
    else if(nw.startsWith(norm(slot.day))&&lead.flexible)best=Math.max(best,66)
  }
  if(norm(lead.startIntent).includes('imediat'))best=Math.min(100,best+4)
  return best
}

export default function AgendaOnlyManagerV3(){
  const [students,setStudents]=useState<Student[]>([]),[slots,setSlots]=useState<Slot[]>([]),[leads,setLeads]=useState<Lead[]>([])
  const [day,setDay]=useState('Segunda'),[modalityFilter,setModalityFilter]=useState<ModalityFilter>('Todas'),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState('')
  const [opening,setOpening]=useState(false),[newSlot,setNewSlot]=useState({...blank}),[selected,setSelected]=useState<Slot|null>(null),[matches,setMatches]=useState<{lead:Lead;score:number}[]>([])

  async function load(){
    setLoading(true);setError('')
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000)
    try{
      const [ar,sr,lr]=await Promise.all([
        fetch('/api/admin/aulas?only=slots',{cache:'no-store',signal:controller.signal}),
        fetch('/api/admin/alunos',{cache:'no-store',signal:controller.signal}),
        fetch('/api/admin/aulas?only=leads',{cache:'no-store',signal:controller.signal})
      ])
      if(!ar.ok||!sr.ok||!lr.ok)throw new Error('Não foi possível carregar a gestão.')
      const [ad,sd,ld]=await Promise.all([ar.json(),sr.json(),lr.json()])
      setSlots(Array.isArray(ad.slots)?ad.slots:[]);setStudents(Array.isArray(sd.students)?sd.students:[]);setLeads(Array.isArray(ld.leads)?ld.leads:[])
    }catch(err:any){setError(err?.name==='AbortError'?'A gestão demorou demais para responder.':'Não foi possível carregar a agenda.')}finally{clearTimeout(timer);setLoading(false)}
  }
  useEffect(()=>{load()},[])

  async function post(payload:any){const r=await fetch('/api/admin/aulas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Não foi possível concluir.');return d}
  async function addSlot(e:FormEvent){e.preventDefault();const dayToShow=newSlot.day;const tempId=`temp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;const optimistic:Slot={...newSlot,id:tempId,dayOrder:days.indexOf(newSlot.day)+1};setSlots(v=>[...v,optimistic]);setOpening(false);setDay(dayToShow);setNewSlot({...blank});try{const d=await post({action:'saveSlot',slot:{...optimistic,id:undefined}});if(d?.slot)setSlots(v=>v.map(s=>s.id===tempId?d.slot:s))}catch(e:any){setSlots(v=>v.filter(s=>s.id!==tempId));alert(e.message)}}
  async function updateStatus(status:Slot['status']){if(!selected)return;try{const d=await post({action:'saveSlot',slot:{...selected,status}});setSlots(v=>v.map(s=>s.id===selected.id?d.slot:s));setSelected(d.slot)}catch(e:any){alert(e.message)}}
  async function remove(){if(!selected||!confirm(`Remover ${selected.day} ${selected.time}?`))return;try{await post({action:'deleteSlot',id:selected.id});setSlots(v=>v.filter(s=>s.id!==selected.id));setSelected(null)}catch(e:any){alert(e.message)}}
  function ranked(slot:Slot){return leads.filter(l=>['waiting','contacted','offered',''].includes(text(l.status))).map(lead=>({lead,score:score(lead,slot)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)}
  function inspect(slot:Slot){setMatches(ranked(slot));setSelected(slot)}
  async function markOffered(lead:Lead){if(!lead.id)return;try{await post({action:'updateLeadStatus',id:lead.id,status:'offered'});setLeads(v=>v.map(l=>l.id===lead.id?{...l,status:'offered',offeredAt:new Date().toISOString()}:l))}catch{}}
  async function fill(lead:Lead){if(!selected||!lead.id)return;const modality=selected.modality==='Online ou Presencial'?(norm(lead.modality).includes('presencial')&&!norm(lead.modality).includes('online')?'Presencial':'Online'):selected.modality;if(!confirm(`Preencher ${selected.day}, ${selected.time}–${endTime(selected.time,selected.durationMinutes)} (${modality}) com ${lead.name||'este interessado'}?\n\nO cadastro será convertido em aluno e essa vaga ficará ocupada.`))return;setBusy(lead.id);try{await post({action:'fillSlotFromLead',leadId:lead.id,slotId:selected.id,modality});setSelected(null);await load()}catch(e:any){alert(e.message)}finally{setBusy('')}}

  const active=students.filter(s=>s.status==='active')
  const occurrences=useMemo<StudentOccurrence[]>(()=>active.flatMap(student=>{const durationMinutes=safeDuration(student.durationMinutes);const rows:StudentOccurrence[]=[];if(student.day&&student.time)rows.push({key:`${student.id}-1`,student,day:student.day,time:student.time,durationMinutes});if(Number(student.weeklyFrequency)===2&&student.secondDay&&student.secondTime)rows.push({key:`${student.id}-2`,student,day:student.secondDay,time:student.secondTime,durationMinutes});return rows}),[students])
  const overlapsStudent=(slot:Slot)=>occurrences.some(o=>o.day===slot.day&&minutes(slot.time)<minutes(o.time)+o.durationMinutes&&minutes(slot.time)+safeDuration(slot.durationMinutes)>minutes(o.time))
  const open=slots.filter(s=>s.status==='available'&&!s.studentId&&!overlapsStudent(s))
  const filteredOccurrences=occurrences.filter(o=>modalityMatches(o.student.modality,modalityFilter))
  const filteredOpen=open.filter(s=>modalityMatches(s.modality,modalityFilter))
  const waiting=leads.filter(l=>['waiting','contacted','offered',''].includes(text(l.status)))
  const filteredWaiting=waiting.filter(l=>modalityMatches(l.modality,modalityFilter))
  const revenuePotential=filteredOpen.reduce((sum,s)=>sum+(s.modality==='Presencial'?600:500),0)

  const opportunities=useMemo<Opportunity[]>(()=>{
    const out:Opportunity[]=[]
    const perfect=filteredOpen.map(slot=>({slot,best:ranked(slot)[0]})).filter(x=>x.best&&x.best.score>=94).sort((a,b)=>(b.best?.score||0)-(a.best?.score||0))
    perfect.slice(0,3).forEach(x=>out.push({kind:'match',title:`${x.best!.lead.name||'Interessado'} encaixa em ${x.slot.day} ${x.slot.time}`,detail:`${x.best!.score}% de compatibilidade • ${x.slot.modality} • ${durationLabel(x.slot.durationMinutes)}`,day:x.slot.day,leadId:x.best!.lead.id,score:x.best!.score}))
    const demand=new Map<string,{label:string,count:number}>()
    filteredWaiting.forEach(lead=>(Array.isArray(lead.availability)?lead.availability:[]).forEach(raw=>{const label=String(raw).split('|')[0].trim();if(!label)return;const key=norm(label);const cur=demand.get(key)||{label,count:0};cur.count+=1;demand.set(key,cur)}))
    ;[...demand.values()].filter(x=>x.count>=2).sort((a,b)=>b.count-a.count).slice(0,2).forEach(x=>{const [d,p]=x.label.split('-').map(v=>v.trim());const has=filteredOpen.some(s=>norm(s.day)===norm(d)&&norm(period(s.time))===norm(p));if(!has)out.push({kind:'demand',title:`${x.count} pessoas procuram ${x.label}`,detail:'Não existe vaga aberta nesse período.',day:d})})
    days.forEach(d=>{const dayRows=filteredOccurrences.filter(o=>o.day===d).sort((a,b)=>minutes(a.time)-minutes(b.time));for(let i=0;i<dayRows.length-1;i++){const a=dayRows[i],b=dayRows[i+1];const free=minutes(b.time)-(minutes(a.time)+a.durationMinutes);const aPres=norm(a.student.modality)==='presencial',bPres=norm(b.student.modality)==='presencial';const different=aPres&&bPres&&norm(a.student.neighborhood)!==norm(b.student.neighborhood)&&a.student.neighborhood&&b.student.neighborhood;if(different&&free<30)out.push({kind:'route',title:`Deslocamento apertado em ${d}`,detail:`${a.student.name||'Aluno'} (${a.student.neighborhood}) termina ${endTime(a.time,a.durationMinutes)} → ${b.student.name||'Aluno'} (${b.student.neighborhood}) às ${b.time}, com só ${Math.max(0,free)} min livres.`,day:d});else if(free>=90)out.push({kind:'gap',title:`Janela ociosa de ${Math.floor(free/60)}h${free%60?`${free%60}min`:''} em ${d}`,detail:`Entre ${a.student.name||'aluno'} (termina ${endTime(a.time,a.durationMinutes)}) e ${b.student.name||'aluno'} (${b.time}).`,day:d})}})
    return out.slice(0,6)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[students,slots,leads,modalityFilter])

  const items=[...filteredOccurrences.filter(o=>o.day===day).map(o=>({kind:'student' as const,time:o.time,occurrence:o})),...filteredOpen.filter(s=>s.day===day).map(s=>({kind:'slot' as const,time:text(s.time),slot:s}))].sort((a,b)=>a.time.localeCompare(b.time))
  const opportunityIcon=(kind:Opportunity['kind'])=>kind==='match'?'🔥':kind==='demand'?'💡':kind==='route'?'⚠️':kind==='gap'?'⏱️':'💰'

  return <main className={styles.page}>
    <header className={styles.top}><div><span>FOCO EM CANTO</span><h1>Gestão de Aulas</h1></div><div className={styles.topActions}><a href="/aulasindividuais/" target="_blank">Página pública ↗</a><a href="/gestao/aulas/alunos/">+ Cadastrar aluno</a></div></header>
    <div className={styles.shell}>
      <section className={styles.stats}><div><small>Alunos ativos</small><strong>{active.length}</strong></div><div><small>Vagas abertas</small><strong>{filteredOpen.length}</strong></div><div><small>Receita potencial</small><strong>{money(revenuePotential)}</strong></div></section>
      <nav className={styles.tabs}><a href="/gestao/aulas/" className={styles.active}>Agenda</a><a href="/gestao/aulas/alunos/">Alunos</a><a href="/gestao/aulas/interesse/">Lista de interesse</a></nav>
      {loading?<div className={styles.loading}>Analisando sua agenda...</div>:error?<div className={styles.error}>{error}</div>:<>
        <section className={styles.opportunityPanel}><div className={styles.opportunityHead}><div><span>ASSISTENTE DE AGENDA</span><h2>Oportunidades</h2><p>O sistema cruza duração real das aulas, vagas, interessados e logística para mostrar onde agir primeiro.</p></div><div className={styles.opportunityCount}>{opportunities.length}</div></div><div className={styles.opportunityGrid}>{opportunities.length?opportunities.map((op,i)=><button key={`${op.kind}-${i}`} className={styles.opportunityCard} onClick={()=>{if(op.day&&days.includes(op.day))setDay(op.day);if(op.kind==='match'&&op.leadId)window.location.href='/gestao/aulas/interesse/'}}><span className={styles.opportunityIcon}>{opportunityIcon(op.kind)}</span><div><strong>{op.title}</strong><p>{op.detail}</p></div><span className={styles.opportunityArrow}>→</span></button>):<div className={styles.opportunityEmpty}>Nenhum alerta importante agora. Sua agenda está bem organizada.</div>}</div></section>
        <div className={styles.sectionBar}><div><h2>Agenda semanal</h2><p>Alunos, vagas e candidatos compatíveis em ordem cronológica.</p></div><button onClick={()=>{setNewSlot({...blank,day,modality:modalityFilter==='Todas'?'Online':modalityFilter});setOpening(true)}}>+ Abrir vaga</button></div>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:14}}><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{days.map((d,i)=><button key={d} onClick={()=>setDay(d)} style={{padding:'10px 14px',borderRadius:10,border:'1px solid rgba(255,255,255,.1)',background:day===d?'#efcc89':'#12171d',color:day===d?'#17120b':'#aab2bc',fontWeight:800,cursor:'pointer'}}>{short[i]}</button>)}</div><div style={{display:'flex',gap:6,padding:4,borderRadius:12,background:'#0f141a',border:'1px solid rgba(255,255,255,.08)'}}>{(['Todas','Online','Presencial'] as ModalityFilter[]).map(m=><button key={m} onClick={()=>setModalityFilter(m)} style={{padding:'8px 12px',border:0,borderRadius:9,background:modalityFilter===m?'#242d38':'transparent',color:modalityFilter===m?'#fff':'#89939f',fontWeight:800,cursor:'pointer'}}>{m}</button>)}</div></div>
        <section className={styles.agenda} style={{gridTemplateColumns:'1fr'}}><article className={styles.day}><div className={styles.dayHead}><h2>{day}</h2><span>{items.length} item{items.length===1?'':'s'} • {modalityFilter}</span></div><div className={styles.events}>{items.map(item=>item.kind==='student'?<a href="/gestao/aulas/alunos/" key={`s-${item.occurrence.key}`} className={styles.event} style={{background:text(item.occurrence.student.color)||'#7427b9',textDecoration:'none'}}><div className={styles.time}><span style={{display:'block'}}>{item.time||'--:--'}</span><small style={{fontSize:10,opacity:.72}}>até {endTime(item.time,item.occurrence.durationMinutes)}</small></div><div className={styles.eventBody}><strong>{text(item.occurrence.student.name)||'Aluno'}</strong><span>{text(item.occurrence.student.modality)||'Online'} • {durationLabel(item.occurrence.durationMinutes)}{item.occurrence.student.neighborhood?` • ${item.occurrence.student.neighborhood}`:''}</span><small>{text(item.occurrence.student.address)}</small></div><div className={styles.chevron}>›</div></a>:(()=>{const r=ranked(item.slot);return <button key={`v-${item.slot.id}`} className={`${styles.event} ${item.slot.status==='available'?styles.vacancy:''}`} onClick={()=>inspect(item.slot)}><div className={styles.time}><span style={{display:'block'}}>{item.time}</span><small style={{fontSize:10,opacity:.72}}>até {endTime(item.time,item.slot.durationMinutes)}</small></div><div className={styles.eventBody}><strong>Vaga disponível</strong><span>{item.slot.modality} • {durationLabel(item.slot.durationMinutes)}</span><small>{r.length?`${r.length} candidato${r.length>1?'s':''} • melhor ${r[0].score}%`:'Nenhum candidato compatível'}</small></div><div className={styles.chevron}>›</div></button>})())}{!items.length&&<div className={styles.emptyDay}>Nenhuma aula ou vaga neste dia com esse filtro.</div>}</div></article></section>
      </>}
    </div>
    {opening&&<div className={styles.backdrop} onClick={()=>setOpening(false)}><form className={styles.modal} onSubmit={addSlot} onClick={e=>e.stopPropagation()}><div className={styles.modalHead}><div><span>NOVO HORÁRIO</span><h2>Abrir vaga</h2></div><button type="button" onClick={()=>setOpening(false)}>×</button></div><div className={styles.formGrid}><label>Dia<select value={newSlot.day} onChange={e=>setNewSlot(v=>({...v,day:e.target.value}))}>{days.map(d=><option key={d}>{d}</option>)}</select></label><label>Horário inicial<input type="time" value={newSlot.time} onChange={e=>setNewSlot(v=>({...v,time:e.target.value}))}/></label><label>Duração<select value={newSlot.durationMinutes} onChange={e=>setNewSlot(v=>({...v,durationMinutes:Number(e.target.value)}))}><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1 hora</option><option value={75}>1h15</option><option value={90}>1h30</option><option value={105}>1h45</option><option value={120}>2 horas</option></select></label><label>Modalidade<select value={newSlot.modality} onChange={e=>setNewSlot(v=>({...v,modality:e.target.value}))}><option>Online</option><option>Presencial</option><option>Online ou Presencial</option></select></label><label>Status<select value={newSlot.status} onChange={e=>setNewSlot(v=>({...v,status:e.target.value as Slot['status']}))}><option value="available">Disponível</option><option value="occupied">Ocupado</option><option value="blocked">Bloqueado</option></select></label></div><div style={{marginTop:12,padding:'11px 13px',borderRadius:11,background:'#141a21',color:'#8f99a5',fontSize:12}}>Essa vaga ocupará <strong style={{color:'#fff'}}>{newSlot.time}–{endTime(newSlot.time,newSlot.durationMinutes)}</strong>.</div><div className={styles.modalActions}><button type="button" onClick={()=>setOpening(false)}>Cancelar</button><button className={styles.save}>Adicionar horário</button></div></form></div>}
    {selected&&<div className={styles.backdrop} onClick={()=>setSelected(null)}><div className={styles.modal} onClick={e=>e.stopPropagation()}><div className={styles.modalHead}><div><span>HORÁRIO</span><h2>{selected.day} • {selected.time}–${endTime(selected.time,selected.durationMinutes)}</h2><small style={{color:'#87919d'}}>{selected.modality} • {durationLabel(selected.durationMinutes)}</small></div><button onClick={()=>setSelected(null)}>×</button></div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:18}}><button onClick={()=>updateStatus('available')}>Disponível</button><button onClick={()=>updateStatus('occupied')}>Ocupado</button><button onClick={()=>updateStatus('blocked')}>Bloqueado</button><button onClick={remove}>Remover</button></div>{selected.status==='available'&&<div className={styles.matches}>{matches.map(({lead,score},index)=>{const name=text(lead.name)||'Interessado';const offered=lead.status==='offered';return <article key={lead.id}><b>{score}%</b><div><strong>{index+1}º • {name}</strong><span>{Array.isArray(lead.availability)?lead.availability.join(' • '):''}</span><small>{offered?'Vaga já oferecida • próximo candidato abaixo se não responder':score>=94?'Prioridade alta':'Compatível'}</small></div><div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end'}}>{lead.whatsapp&&<a onClick={()=>markOffered(lead)} href={wa(lead.whatsapp,`Oi, ${name.split(' ')[0]}! Tudo bem? Aqui é o Marcos Cruz 😊 Surgiu uma vaga ${selected.modality==='Online ou Presencial'?'online ou presencial':selected.modality.toLowerCase()} na ${selected.day.toLowerCase()}, das ${selected.time} às ${endTime(selected.time,selected.durationMinutes)}. Você ainda tem interesse?`)} target="_blank">{offered?'Reenviar':'Oferecer vaga'}</a>}<button disabled={busy===lead.id} onClick={()=>fill(lead)} style={{padding:'10px 11px',borderRadius:10,border:0,background:'#9ce0bf',color:'#10251b',fontSize:10,fontWeight:900,cursor:'pointer'}}>{busy===lead.id?'Preenchendo...':'Preencher vaga'}</button></div></article>})}{!matches.length&&<div className={styles.bigEmpty}>Nenhum candidato compatível.</div>}</div>}</div></div>}
  </main>
}