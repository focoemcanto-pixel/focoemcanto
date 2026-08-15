'use client'

import { useCallback, useEffect, useState } from 'react'
import styles from '../unified-aulas.module.css'

type Lead={id:string;status?:string;name?:string;whatsapp?:string;modality?:string;availability?:string[];startIntent?:string;goal?:string;neighborhood?:string;city?:string}

const text=(v:unknown)=>typeof v==='string'?v:''
const wa=(phone:unknown,msg:string)=>{const d=text(phone).replace(/\D/g,'');if(!d)return '#';return `https://wa.me/${d.startsWith('55')?d:`55${d}`}?text=${encodeURIComponent(msg)}`}
const availability=(value:unknown)=>Array.isArray(value)?value.slice(0,30).map(v=>text(v).slice(0,100)).filter(Boolean).join(' • '):''

export default function InterestManager(){
  const [leads,setLeads]=useState<Lead[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  const load=useCallback(async()=>{
    setLoading(true)
    setError('')
    const controller=new AbortController()
    const timer=setTimeout(()=>controller.abort(),6000)
    try{
      const r=await fetch('/api/admin/interessados',{cache:'no-store',signal:controller.signal})
      const d=await r.json().catch(()=>({}))
      if(!r.ok)throw new Error(d?.detail||d?.error||'Não foi possível carregar a lista.')
      setLeads(Array.isArray(d.leads)?d.leads:[])
      if(d.partial)setError(`A lista carregou parcialmente. ${d.failedCount||0} registro(s) não responderam.`)
    }catch(err:any){
      setLeads([])
      setError(err?.name==='AbortError'?'A API demorou mais de 6 segundos para responder.':'Falha ao carregar a lista: '+(err?.message||'erro desconhecido'))
    }finally{
      clearTimeout(timer)
      setLoading(false)
    }
  },[])

  useEffect(()=>{load()},[load])

  return <main className={styles.page}>
    <header className={styles.top}>
      <div><span>FOCO EM CANTO</span><h1>Gestão de Aulas</h1></div>
      <div className={styles.topActions}><a href="/aulasindividuais/" target="_blank">Página pública ↗</a></div>
    </header>
    <div className={styles.shell}>
      <nav className={styles.tabs} style={{display:'flex',gap:8}}>
        <a href="/gestao/aulas/">Agenda</a>
        <a href="/gestao/aulas/alunos/">Alunos</a>
        <a href="/gestao/aulas/interesse/" className={styles.active}>Lista de interesse</a>
      </nav>
      <div className={styles.sectionBar}><div><h2>Lista de interesse</h2><p>Pessoas que solicitaram uma vaga pela página pública.</p></div></div>
      {loading&&<div className={styles.loading}>Carregando interessados...</div>}
      {!loading&&error&&<div className={styles.error} style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><span>{error}</span><button onClick={load} style={{padding:'9px 12px',borderRadius:9,border:0,fontWeight:800,cursor:'pointer'}}>Tentar novamente</button></div>}
      {!loading&&<section className={styles.leads}>
        {leads.map((lead,index)=>{const name=text(lead.name)||'Interessado';return <article className={styles.leadCard} key={text(lead.id)||`lead-${index}`}>
          <div><strong>{name}</strong><span>{text(lead.modality)||'Modalidade não informada'} • {text(lead.startIntent)||'início não informado'}</span><small>{availability(lead.availability)||'Disponibilidade não informada'}</small></div>
          <div className={styles.goal}>{text(lead.goal)||'Objetivo não informado'}</div>
          {lead.whatsapp&&<a href={wa(lead.whatsapp,`Oi, ${name.split(' ')[0]}! Tudo bem? Aqui é o Marcos 😊 Você se cadastrou na minha lista de interesse para aulas individuais de canto.`)} target="_blank">WhatsApp</a>}
        </article>})}
        {!leads.length&&!error&&<div className={styles.bigEmpty}>Ainda não há interessados cadastrados.</div>}
      </section>}
    </div>
  </main>
}
