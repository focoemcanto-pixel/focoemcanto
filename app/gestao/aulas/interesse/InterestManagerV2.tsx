'use client'

import { useEffect, useState } from 'react'
import styles from '../unified-aulas.module.css'

type Lead={id?:string;status?:string;name?:string;whatsapp?:string;modality?:string;availability?:unknown;startIntent?:string;goal?:string}
const txt=(v:unknown)=>typeof v==='string'?v:''
const wa=(phone:unknown,msg:string)=>{const d=txt(phone).replace(/\D/g,'');if(!d)return '#';const p=d.startsWith('55')?d:`55${d}`;return `https://wa.me/${p}?text=${encodeURIComponent(msg)}`}
const availability=(v:unknown)=>Array.isArray(v)?v.slice(0,20).map(x=>txt(x).slice(0,120)).filter(Boolean).join(' • '):''

export default function InterestManagerV2(){
  const [leads,setLeads]=useState<Lead[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  function load(){
    setLoading(true);setError('')
    const controller=new AbortController()
    const timer=window.setTimeout(()=>controller.abort(),7000)
    fetch(`/api/admin/aulas?only=leads&t=${Date.now()}`,{cache:'no-store',signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error(`Falha ao carregar (${r.status})`);return r.json()})
      .then(d=>setLeads(Array.isArray(d?.leads)?d.leads:[]))
      .catch(err=>setError(err?.name==='AbortError'?'A API não respondeu em 7 segundos.':'Erro ao carregar a lista de interesse.'))
      .finally(()=>{window.clearTimeout(timer);setLoading(false)})
  }

  useEffect(()=>{load()},[])

  return <main className={styles.page}>
    <header className={styles.top}><div><span>FOCO EM CANTO</span><h1>Gestão de Aulas</h1></div><div className={styles.topActions}><a href="/aulasindividuais/" target="_blank">Página pública ↗</a></div></header>
    <div className={styles.shell}>
      <nav className={styles.tabs}><a href="/gestao/aulas/">Agenda</a><a href="/gestao/aulas/alunos/">Alunos</a><a href="/gestao/aulas/interesse/" className={styles.active}>Lista de interesse</a></nav>
      <div className={styles.sectionBar}><div><h2>Lista de interesse</h2><p>Pessoas que solicitaram uma vaga pela página pública.</p></div></div>
      {loading&&<div className={styles.loading}>Carregando interessados...</div>}
      {error&&<div className={styles.error}>{error}<div style={{marginTop:10}}><button onClick={load}>Tentar novamente</button></div></div>}
      {!loading&&!error&&<section className={styles.leads}>{leads.map((lead,i)=>{const name=txt(lead.name)||'Interessado';return <article className={styles.leadCard} key={txt(lead.id)||`lead-${i}`}><div><strong>{name}</strong><span>{txt(lead.modality)||'Modalidade não informada'} • {txt(lead.startIntent)||'início não informado'}</span><small>{availability(lead.availability)||'Disponibilidade não informada'}</small></div><div className={styles.goal}>{txt(lead.goal)||'Objetivo não informado'}</div>{lead.whatsapp&&<a href={wa(lead.whatsapp,`Oi, ${name.split(' ')[0]}! Tudo bem? Aqui é o Marcos 😊`)} target="_blank">WhatsApp</a>}</article>})}{!leads.length&&<div className={styles.bigEmpty}>Ainda não há interessados cadastrados.</div>}</section>}
      <div style={{marginTop:16,fontSize:10,color:'#5f6874'}}>build: interesse-v2</div>
    </div>
  </main>
}
