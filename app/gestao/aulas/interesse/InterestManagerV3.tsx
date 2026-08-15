'use client'

import { useEffect, useMemo, useState } from 'react'
import styles from '../unified-aulas.module.css'

type Lead={id?:string;status?:string;name?:string;whatsapp?:string;modality?:string;availability?:unknown;flexible?:boolean;startIntent?:string;goal?:string;neighborhood?:string;city?:string;createdAt?:string}
type Slot={id:string;day:string;dayOrder?:number;time:string;modality:string;status:string;studentId?:string}

type Match={slot:Slot;score:number;label:string}

const txt=(v:unknown)=>typeof v==='string'?v:''
const norm=(v:unknown)=>txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const wa=(phone:unknown,msg:string)=>{const d=txt(phone).replace(/\D/g,'');if(!d)return '#';const p=d.startsWith('55')?d:`55${d}`;return `https://wa.me/${p}?text=${encodeURIComponent(msg)}`}
const listAvailability=(v:unknown)=>Array.isArray(v)?v.slice(0,20).map(x=>txt(x).slice(0,120)).filter(Boolean):[]
const period=(time:string)=>{const h=Number((time||'00:00').split(':')[0]);return h<12?'Manhã':h<18?'Tarde':'Noite'}
const statusLabel=(s?:string)=>({waiting:'Na espera',contacted:'Contato feito',offered:'Vaga oferecida',enrolled:'Matriculado',inactive:'Arquivado'}[s||'waiting']||'Na espera')

function compatibility(lead:Lead,slot:Slot){
  if(slot.status!=='available'||slot.studentId)return 0
  const lm=norm(lead.modality),sm=norm(slot.modality)
  const modalityOk=sm.includes('online ou presencial')||lm.includes('ambas')||lm.includes('duas')||lm.includes(sm)||sm.includes(lm)
  if(!modalityOk)return 0
  const target=norm(`${slot.day} - ${period(slot.time)}`)
  let best=0
  for(const raw of listAvailability(lead.availability)){
    const [window='',detail='']=String(raw).split('|').map(x=>x.trim())
    const nw=norm(window),nd=norm(detail)
    if(nw===target&&nd===norm(slot.time))best=Math.max(best,100)
    else if(nw===target&&nd.includes('qualquer'))best=Math.max(best,94)
    else if(nw===target)best=Math.max(best,82)
    else if(nw.startsWith(norm(slot.day))&&lead.flexible)best=Math.max(best,66)
  }
  if(norm(lead.startIntent).includes('imediat'))best=Math.min(100,best+4)
  return best
}

function matchLabel(score:number){
  if(score>=95)return 'Encaixe perfeito'
  if(score>=80)return 'Ótimo encaixe'
  if(score>=65)return 'Possível encaixe'
  return 'Sem vaga compatível'
}

export default function InterestManagerV3(){
  const [leads,setLeads]=useState<Lead[]>([])
  const [slots,setSlots]=useState<Slot[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [filter,setFilter]=useState('active')
  const [busy,setBusy]=useState('')

  async function load(){
    setLoading(true);setError('')
    try{
      const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),8000)
      const [lr,sr]=await Promise.all([
        fetch(`/api/admin/aulas?only=leads&t=${Date.now()}`,{cache:'no-store',signal:controller.signal}),
        fetch(`/api/admin/aulas?only=slots&t=${Date.now()}`,{cache:'no-store',signal:controller.signal})
      ])
      window.clearTimeout(timer)
      if(!lr.ok||!sr.ok)throw new Error('Não foi possível carregar a gestão.')
      const [ld,sd]=await Promise.all([lr.json(),sr.json()])
      setLeads(Array.isArray(ld?.leads)?ld.leads:[])
      setSlots(Array.isArray(sd?.slots)?sd.slots:[])
    }catch(err:any){setError(err?.name==='AbortError'?'A base demorou para responder. Tente novamente.':err?.message||'Erro ao carregar.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[])

  const openSlots=useMemo(()=>slots.filter(s=>s.status==='available'&&!s.studentId),[slots])
  const enriched=useMemo(()=>leads.map(lead=>{
    const matches=openSlots.map(slot=>({slot,score:compatibility(lead,slot)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)
    const best=matches[0]
    return {...lead,matches,best:best?{...best,label:matchLabel(best.score)}:null}
  }),[leads,openSlots])

  const visible=enriched.filter(l=>filter==='all'?true:filter==='active'?['waiting','contacted','offered',''].includes(txt(l.status)):txt(l.status)===filter)
  const perfect=enriched.filter(l=>l.best&&l.best.score>=95&&['waiting','contacted','offered',''].includes(txt(l.status))).length

  async function post(payload:any){
    const r=await fetch('/api/admin/aulas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    const d=await r.json().catch(()=>({}))
    if(!r.ok)throw new Error(d.error||'Não foi possível concluir.')
    return d
  }

  async function updateStatus(lead:Lead,status:string){
    if(!lead.id)return
    setBusy(`status-${lead.id}`)
    try{await post({action:'updateLeadStatus',id:lead.id,status});setLeads(v=>v.map(x=>x.id===lead.id?{...x,status}:x))}catch(e:any){alert(e.message)}finally{setBusy('')}
  }

  async function fill(lead:Lead,match:Match){
    if(!lead.id)return
    const modality=match.slot.modality==='Online ou Presencial'?(norm(lead.modality).includes('presencial')&&!norm(lead.modality).includes('online')?'Presencial':'Online'):match.slot.modality
    const ok=window.confirm(`Preencher ${match.slot.day}, ${match.slot.time} (${modality}) com ${txt(lead.name)||'este interessado'}?\n\nIsso criará o aluno, ocupará a vaga e marcará o cadastro como matriculado.`)
    if(!ok)return
    setBusy(`fill-${lead.id}`)
    try{
      await post({action:'fillSlotFromLead',leadId:lead.id,slotId:match.slot.id,modality})
      await load()
    }catch(e:any){alert(e.message)}finally{setBusy('')}
  }

  return <main className={styles.page}>
    <header className={styles.top}><div><span>FOCO EM CANTO</span><h1>Gestão de Aulas</h1></div><div className={styles.topActions}><a href="/aulasindividuais/" target="_blank">Página pública ↗</a></div></header>
    <div className={styles.shell}>
      <nav className={styles.tabs}><a href="/gestao/aulas/">Agenda</a><a href="/gestao/aulas/alunos/">Alunos</a><a href="/gestao/aulas/interesse/" className={styles.active}>Lista de interesse</a></nav>

      <section style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:12,marginBottom:22}}>
        <div className={styles.smartStat}><span>Interessados ativos</span><strong>{enriched.filter(l=>['waiting','contacted','offered',''].includes(txt(l.status))).length}</strong><small>Pessoas aguardando oportunidade</small></div>
        <div className={styles.smartStat}><span>Encaixes perfeitos</span><strong>{perfect}</strong><small>Compatibilidade alta com vagas abertas</small></div>
        <div className={styles.smartStat}><span>Vagas abertas</span><strong>{openSlots.length}</strong><small>Horários prontos para preenchimento</small></div>
      </section>

      <div className={styles.sectionBar}><div><h2>Lista de interesse</h2><p>Prioridade inteligente baseada em modalidade, dia, turno e horário.</p></div></div>
      <div className={styles.smartFilters}>
        {[['active','Ativos'],['waiting','Na espera'],['contacted','Contato feito'],['offered','Vaga oferecida'],['enrolled','Matriculados'],['all','Todos']].map(([v,l])=><button key={v} className={filter===v?styles.smartFilterActive:''} onClick={()=>setFilter(v)}>{l}</button>)}
      </div>

      {loading&&<div className={styles.loading}>Analisando interessados e vagas...</div>}
      {error&&<div className={styles.error}>{error}<div style={{marginTop:10}}><button onClick={load}>Tentar novamente</button></div></div>}
      {!loading&&!error&&<section className={styles.smartLeadGrid}>
        {visible.map((lead,i)=>{
          const name=txt(lead.name)||'Interessado';const best=lead.best as Match|null
          const msg=best?`Oi, ${name.split(' ')[0]}! Tudo bem? Aqui é o Marcos 😊 Surgiu uma vaga para aula individual na ${best.slot.day.toLowerCase()}, às ${best.slot.time}, na modalidade ${best.slot.modality.toLowerCase()}. Você ainda tem interesse em iniciar?`:`Oi, ${name.split(' ')[0]}! Tudo bem? Aqui é o Marcos 😊 Você se cadastrou na minha lista de interesse para aulas individuais de canto.`
          return <article className={styles.smartLeadCard} key={txt(lead.id)||`lead-${i}`}>
            <div className={styles.smartLeadTop}>
              <div><div className={styles.smartNameRow}><strong>{name}</strong><span className={`${styles.statusPill} ${styles[`status_${txt(lead.status)||'waiting'}`]||''}`}>{statusLabel(lead.status)}</span></div><p>{txt(lead.modality)||'Modalidade não informada'} • {txt(lead.startIntent)||'início não informado'}</p></div>
              {best?<div className={styles.matchBadge}><b>{best.score}%</b><span>{best.label}</span></div>:<div className={styles.noMatchBadge}>Sem encaixe agora</div>}
            </div>

            <div className={styles.smartLeadBody}>
              <div><span className={styles.smartLabel}>DISPONIBILIDADE</span><p>{listAvailability(lead.availability).join(' • ')||'Não informada'}</p></div>
              <div><span className={styles.smartLabel}>OBJETIVO</span><p>{txt(lead.goal)||'Não informado'}</p></div>
            </div>

            {best&&<div className={styles.bestSlot}><div><span>Melhor vaga sugerida</span><strong>{best.slot.day} • {best.slot.time}</strong><small>{best.slot.modality}</small></div><a href="/gestao/aulas/">Ver na agenda ↗</a></div>}

            <div className={styles.smartActions}>
              {lead.whatsapp&&<a className={styles.whatsappBtn} href={wa(lead.whatsapp,msg)} target="_blank">WhatsApp</a>}
              {txt(lead.status)!=='contacted'&&txt(lead.status)!=='enrolled'&&<button disabled={busy===`status-${lead.id}`} onClick={()=>updateStatus(lead,'contacted')}>Marcar contato</button>}
              {best&&txt(lead.status)!=='enrolled'&&<button className={styles.fillBtn} disabled={busy===`fill-${lead.id}`} onClick={()=>fill(lead,best)}>{busy===`fill-${lead.id}`?'Preenchendo...':'Preencher vaga'}</button>}
            </div>
          </article>
        })}
        {!visible.length&&<div className={styles.bigEmpty}>Nenhum cadastro neste filtro.</div>}
      </section>}
    </div>
  </main>
}
