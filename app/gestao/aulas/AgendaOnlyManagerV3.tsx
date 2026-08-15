'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import styles from './unified-aulas.module.css'

type Lead={id:string;status?:string;name?:string;whatsapp?:string;modality?:string;availability?:string[];flexible?:boolean;startIntent?:string;createdAt?:string;offeredAt?:string;contactedAt?:string}
type Student={id:string;name?:string;modality?:string;address?:string;neighborhood?:string;city?:string;day?:string;time?:string;color?:string;status?:string;monthlyValue?:string}
type Slot={id:string;day:string;dayOrder?:number;time:string;modality:string;status:'available'|'occupied'|'blocked';studentId?:string}
type Opportunity={kind:'money'|'match'|'demand'|'route'|'gap';title:string;detail:string;day?:string;leadId?:string;score?:number}

const days=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const short=['Seg','Ter','Qua','Qui','Sex','Sáb']
const blank={day:'Segunda',time:'09:00',modality:'Online',status:'available' as const}
const text=(v:unknown)=>typeof v==='string'?v:''
const norm=(v:unknown)=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const period=(time:string)=>{const h=Number((time||'00:00').split(':')[0]);return h<12?'Manhã':h<18?'Tarde':'Noite'}
const wa=(phone:unknown,msg:string)=>{const d=text(phone).replace(/\D/g,'');if(!d)return '#';return `https://wa.me/${d.startsWith('55')?d:`55${d}`}?text=${encodeURIComponent(msg)}`}
const minutes=(time?:string)=>{const [h,m]=text(time).split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:0}
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value)

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
  const [day,setDay]=useState('Segunda'),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState('')
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
  async function addSlot(e:FormEvent){e.preventDefault();const slot={...newSlot,dayOrder:days.indexOf(newSlot.day)+1};try{await post({action:'saveSlot',slot});setOpening(false);setDay(newSlot.day);setNewSlot({...blank});await load()}catch(e:any){alert(e.message)}}
  async function updateStatus(status:Slot['status']){if(!selected)return;try{const d=await post({action:'saveSlot',slot:{...selected,status}});setSlots(v=>v.map(s=>s.id===selected.id?d.slot:s));setSelected(d.slot)}catch(e:any){alert(e.message)}}
  async function remove(){if(!selected||!confirm(`Remover ${selected.day} ${selected.time}?`))return;try{await post({action:'deleteSlot',id:selected.id});setSlots(v=>v.filter(s=>s.id!==selected.id));setSelected(null)}catch(e:any){alert(e.message)}}
  function ranked(slot:Slot){return leads.filter(l=>['waiting','contacted','offered',''].includes(text(l.status))).map(lead=>({lead,score:score(lead,slot)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)}
  function inspect(slot:Slot){setMatches(ranked(slot));setSelected(slot)}
  async function markOffered(lead:Lead){if(!lead.id)return;try{await post({action:'updateLeadStatus',id:lead.id,status:'offered'});setLeads(v=>v.map(l=>l.id===lead.id?{...l,status:'offered',offeredAt:new Date().toISOString()}:l))}catch{}}
  async function fill(lead:Lead){if(!selected||!lead.id)return;const modality=selected.modality==='Online ou Presencial'?(norm(lead.modality).includes('presencial')&&!norm(lead.modality).includes('online')?'Presencial':'Online'):selected.modality;if(!confirm(`Preencher ${selected.day}, ${selected.time} (${modality}) com ${lead.name||'este interessado'}?\n\nO cadastro será convertido em aluno e essa vaga ficará ocupada.`))return;setBusy(lead.id);try{await post({action:'fillSlotFromLead',leadId:lead.id,slotId:selected.id,modality});setSelected(null);await load()}catch(e:any){alert(e.message)}finally{setBusy('')}}

  const active=students.filter(s=>s.status==='active')
  const open=slots.filter(s=>s.status==='available'&&!s.studentId)
  const waiting=leads.filter(l=>['waiting','contacted','offered',''].includes(text(l.status)))
  const revenuePotential=open.reduce((sum,s)=>sum+(s.modality==='Presencial'?600:500),0)

  const opportunities=useMemo<Opportunity[]>(()=>{
    const out:Opportunity[]=[]
    const perfect=open.map(slot=>({slot,best:ranked(slot)[0]})).filter(x=>x.best&&x.best.score>=94).sort((a,b)=>(b.best?.score||0)-(a.best?.score||0))
    perfect.slice(0,3).forEach(x=>out.push({kind:'match',title:`${x.best!.lead.name||'Interessado'} encaixa em ${x.slot.day} ${x.slot.time}`,detail:`${x.best!.score}% de compatibilidade • ${x.slot.modality}`,day:x.slot.day,leadId:x.best!.lead.id,score:x.best!.score}))

    const demand=new Map<string,{label:string,count:number}>()
    waiting.forEach(lead=>(Array.isArray(lead.availability)?lead.availability:[]).forEach(raw=>{const label=String(raw).split('|')[0].trim();if(!label)return;const key=norm(label);const cur=demand.get(key)||{label,count:0};cur.count+=1;demand.set(key,cur)}))
    ;[...demand.values()].filter(x=>x.count>=2).sort((a,b)=>b.count-a.count).slice(0,2).forEach(x=>{
      const [d,p]=x.label.split('-').map(v=>v.trim());const has=open.some(s=>norm(s.day)===norm(d)&&norm(period(s.time))===norm(p));if(!has)out.push({kind:'demand',title:`${x.count} pessoas procuram ${x.label}`,detail:'Não existe vaga aberta nesse período.',day:d})
    })

    days.forEach(d=>{
      const presencial=active.filter(s=>s.day===d&&norm(s.modality)==='presencial').sort((a,b)=>minutes(a.time)-minutes(b.time))
      for(let i=0;i<presencial.length-1;i++){
        const a=presencial[i],b=presencial[i+1];const free=minutes(b.time)-minutes(a.time)-60;const different=norm(a.neighborhood)!==norm(b.neighborhood)&&a.neighborhood&&b.neighborhood
        if(different&&free<30)out.push({kind:'route',title:`Deslocamento apertado em ${d}`,detail:`${a.name||'Aluno'} (${a.neighborhood}) → ${b.name||'Aluno'} (${b.neighborhood}) com só ${Math.max(0,free)} min livres.`,day:d})
        else if(free>=90)out.push({kind:'gap',title:`Janela ociosa de ${Math.floor(free/60)}h${free%60?`${free%60}min`:''} em ${d}`,detail:`Entre ${a.name||'aluno'} (${a.time}) e ${b.name||'aluno'} (${b.time}). Pode virar oportunidade de nova aula.`,day:d})
      }
    })
    return out.slice(0,6)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[students,slots,leads])

  const items=[...active.filter(s=>s.day===day).map(s=>({kind:'student' as const,time:text(s.time),student:s})),...slots.filter(s=>s.day===day&&!s.studentId).map(s=>({kind:'slot' as const,time:text(s.time),slot:s}))].sort((a,b)=>a.time.localeCompare(b.time))

  const opportunityIcon=(kind:Opportunity['kind'])=>kind==='match'?'🔥':kind==='demand'?'💡':kind==='route'?'⚠️':kind==='gap'?'⏱️':'💰'

  return <main className={styles.page}>
    <header className={styles.top}><div><span>FOCO EM CANTO</span><h1>Gestão de Aulas</h1></div><div className={styles.topActions}><a href="/aulasindividuais/" target="_blank">Página pública ↗</a><a href="/gestao/aulas/alunos/">+ Cadastrar aluno</a></div></header>
    <div className={styles.shell}>
      <section className={styles.stats}><div><small>Alunos ativos</small><strong>{active.length}</strong></div><div><small>Vagas abertas</small><strong>{open.length}</strong></div><div><small>Receita potencial</small><strong>{money(revenuePotential)}</strong></div></section>
      <nav className={styles.tabs}><a href="/gestao/aulas/" className={styles.active}>Agenda</a><a href="/gestao/aulas/alunos/">Alunos</a><a href="/gestao/aulas/interesse/">Lista de interesse</a></nav>
      {loading?<div className={styles.loading}>Analisando sua agenda...</div>:error?<div className={styles.error}>{error}</div>:<>
        <section className={styles.opportunityPanel}>
          <div className={styles.opportunityHead}><div><span>ASSISTENTE DE AGENDA</span><h2>Oportunidades</h2><p>O sistema cruza vagas, interessados e sua logística para mostrar onde agir primeiro.</p></div><div className={styles.opportunityCount}>{opportunities.length}</div></div>
          <div className={styles.opportunityGrid}>{opportunities.length?opportunities.map((op,i)=><button key={`${op.kind}-${i}`} className={styles.opportunityCard} onClick={()=>{if(op.day&&days.includes(op.day))setDay(op.day);if(op.kind==='match'&&op.leadId)window.location.href='/gestao/aulas/interesse/'}}><span className={styles.opportunityIcon}>{opportunityIcon(op.kind)}</span><div><strong>{op.title}</strong><p>{op.detail}</p></div><span className={styles.opportunityArrow}>→</span></button>):<div className={styles.opportunityEmpty}>Nenhum alerta importante agora. Sua agenda está bem organizada.</div>}</div>
        </section>

        <div className={styles.sectionBar}><div><h2>Agenda semanal</h2><p>Alunos, vagas e candidatos compatíveis em ordem cronológica.</p></div><button onClick={()=>{setNewSlot({...blank,day});setOpening(true)}}>+ Abrir vaga</button></div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>{days.map((d,i)=><button key={d} onClick={()=>setDay(d)} style={{padding:'10px 14px',borderRadius:10,border:'1px solid rgba(255,255,255,.1)',background:day===d?'#efcc89':'#12171d',color:day===d?'#17120b':'#aab2bc',fontWeight:800,cursor:'pointer'}}>{short[i]}</button>)}</div>
        <section className={styles.agenda} style={{gridTemplateColumns:'1fr'}}><article className={styles.day}><div className={styles.dayHead}><h2>{day}</h2><span>{items.length} item{items.length===1?'':'s'}</span></div><div className={styles.events}>{items.map(item=>item.kind==='student'?<a href="/gestao/aulas/alunos/" key={`s-${item.student.id}`} className={styles.event} style={{background:text(item.student.color)||'#7427b9',textDecoration:'none'}}><div className={styles.time}>{item.time||'--:--'}</div><div className={styles.eventBody}><strong>{text(item.student.name)||'Aluno'}</strong><span>{text(item.student.modality)||'Online'}{item.student.neighborhood?` • ${item.student.neighborhood}`:''}</span><small>{text(item.student.address)}</small></div><div className={styles.chevron}>›</div></a>:(()=>{const r=ranked(item.slot);return <button key={`v-${item.slot.id}`} className={`${styles.event} ${item.slot.status==='available'?styles.vacancy:''}`} style={item.slot.status==='occupied'?{background:'#222832'}:item.slot.status==='blocked'?{background:'#181b20'}:undefined} onClick={()=>inspect(item.slot)}><div className={styles.time}>{item.time}</div><div className={styles.eventBody}><strong>{item.slot.status==='available'?'Vaga disponível':item.slot.status==='occupied'?'Horário ocupado':'Horário bloqueado'}</strong><span>{item.slot.modality}</span><small>{item.slot.status==='available'?(r.length?`${r.length} candidato${r.length>1?'s':''} • melhor ${r[0].score}%`:'Nenhum candidato compatível'):'Clique para gerenciar'}</small></div><div className={styles.chevron}>›</div></button>})())}{!items.length&&<div className={styles.emptyDay}>Nenhuma aula ou vaga neste dia.</div>}</div></article></section>
      </>}
    </div>

    {opening&&<div className={styles.backdrop} onClick={()=>setOpening(false)}><form className={styles.modal} onSubmit={addSlot} onClick={e=>e.stopPropagation()}><div className={styles.modalHead}><div><span>NOVO HORÁRIO</span><h2>Abrir vaga</h2></div><button type="button" onClick={()=>setOpening(false)}>×</button></div><div className={styles.formGrid}><label>Dia<select value={newSlot.day} onChange={e=>setNewSlot(v=>({...v,day:e.target.value}))}>{days.map(d=><option key={d}>{d}</option>)}</select></label><label>Horário<input type="time" value={newSlot.time} onChange={e=>setNewSlot(v=>({...v,time:e.target.value}))}/></label><label>Modalidade<select value={newSlot.modality} onChange={e=>setNewSlot(v=>({...v,modality:e.target.value}))}><option>Online</option><option>Presencial</option><option>Online ou Presencial</option></select></label><label>Status<select value={newSlot.status} onChange={e=>setNewSlot(v=>({...v,status:e.target.value as Slot['status']}))}><option value="available">Disponível</option><option value="occupied">Ocupado</option><option value="blocked">Bloqueado</option></select></label></div><div className={styles.modalActions}><button type="button" onClick={()=>setOpening(false)}>Cancelar</button><button className={styles.save}>Adicionar horário</button></div></form></div>}

    {selected&&<div className={styles.backdrop} onClick={()=>setSelected(null)}><div className={styles.modal} onClick={e=>e.stopPropagation()}><div className={styles.modalHead}><div><span>HORÁRIO</span><h2>{selected.day} • {selected.time}</h2></div><button onClick={()=>setSelected(null)}>×</button></div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:18}}><button onClick={()=>updateStatus('available')}>Disponível</button><button onClick={()=>updateStatus('occupied')}>Ocupado</button><button onClick={()=>updateStatus('blocked')}>Bloqueado</button><button onClick={remove}>Remover</button></div>{selected.status==='available'&&<div className={styles.matches}>{matches.map(({lead,score},index)=>{const name=text(lead.name)||'Interessado';const offered=lead.status==='offered';return <article key={lead.id}><b>{score}%</b><div><strong>{index+1}º • {name}</strong><span>{Array.isArray(lead.availability)?lead.availability.join(' • '):''}</span><small>{offered?'Vaga já oferecida • próximo candidato abaixo se não responder':score>=94?'Prioridade alta':'Compatível'}</small></div><div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end'}}>{lead.whatsapp&&<a onClick={()=>markOffered(lead)} href={wa(lead.whatsapp,`Oi, ${name.split(' ')[0]}! Tudo bem? Aqui é o Marcos Cruz 😊 Surgiu uma vaga ${selected.modality==='Online ou Presencial'?'online ou presencial':selected.modality.toLowerCase()} na ${selected.day.toLowerCase()}, às ${selected.time}. Você ainda tem interesse?`)} target="_blank">{offered?'Reenviar':'Oferecer vaga'}</a>}<button disabled={busy===lead.id} onClick={()=>fill(lead)} style={{padding:'10px 11px',borderRadius:10,border:0,background:'#9ce0bf',color:'#10251b',fontSize:10,fontWeight:900,cursor:'pointer'}}>{busy===lead.id?'Preenchendo...':'Preencher vaga'}</button></div></article>})}{!matches.length&&<div className={styles.bigEmpty}>Nenhum candidato compatível.</div>}</div>}</div></div>}
  </main>
}
