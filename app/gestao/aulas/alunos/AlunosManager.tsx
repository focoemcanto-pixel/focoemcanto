'use client'

import { FormEvent, useEffect, useState } from 'react'

type Student={id:string;name:string;whatsapp:string;email?:string;modality:string;address?:string;neighborhood?:string;city?:string;day:string;dayOrder:number;time:string;monthlyValue?:string;paymentDay?:string;notes?:string;status:'active'|'inactive';createdAt?:string}

const days=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const emptyStudent:Student={id:'',name:'',whatsapp:'',email:'',modality:'Online',address:'',neighborhood:'',city:'Salvador',day:'Segunda',dayOrder:1,time:'09:00',monthlyValue:'500',paymentDay:'10',notes:'',status:'active'}

function wa(phone:string,message:string){const digits=phone.replace(/\D/g,'');const p=digits.startsWith('55')?digits:`55${digits}`;return `https://wa.me/${p}?text=${encodeURIComponent(message)}`}

export default function AlunosManager(){
  const [students,setStudents]=useState<Student[]>([])
  const [loading,setLoading]=useState(true)
  const [modal,setModal]=useState(false)
  const [form,setForm]=useState<Student>({...emptyStudent})
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  async function load(){
    setLoading(true)
    const r=await fetch('/api/admin/alunos',{cache:'no-store'})
    if(r.ok){const d=await r.json();setStudents(d.students||[])}
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  function open(student?:Student){setError('');setForm(student?{...student}:{...emptyStudent});setModal(true)}

  async function submit(e:FormEvent){
    e.preventDefault();setSaving(true);setError('')
    const r=await fetch('/api/admin/alunos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',student:{...form,dayOrder:days.indexOf(form.day)+1}})})
    const d=await r.json().catch(()=>({}))
    setSaving(false)
    if(!r.ok){setError(d.error||'Não foi possível salvar o aluno.');return}
    setModal(false);await load()
  }

  async function release(student:Student){
    if(!window.confirm(`Liberar o horário de ${student.name}? A vaga ficará disponível na agenda e o aluno será mantido no histórico.`))return
    await fetch('/api/admin/alunos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'release',id:student.id})})
    await load()
  }

  return <main className="ga-page">
    <header className="ga-top"><div><span>FOCO EM CANTO</span><h1>Alunos Particulares</h1></div><a href="/gestao/aulas">← Voltar para agenda</a></header>
    <section className="ga-shell">
      <div className="ga-student-toolbar"><div><strong>Cadastre sua base atual</strong><span>Ao salvar um aluno ativo, o horário é ocupado automaticamente na agenda.</span></div><button onClick={()=>open()}>+ Cadastrar aluno</button></div>
      {loading?<div className="ga-empty students">Carregando alunos...</div>:<div className="ga-student-list">
        {students.map(student=><article className="ga-student-card" key={student.id}>
          <div className="ga-student-id"><span>{student.name.charAt(0).toUpperCase()}</span><div><strong>{student.name}</strong><small>{student.whatsapp||'WhatsApp não informado'}{student.email?` • ${student.email}`:''}</small><i className={`ga-student-status ${student.status}`}>{student.status==='active'?'Ativo':'Inativo'}</i></div></div>
          <div className="ga-student-schedule"><strong>{student.day} • {student.time}</strong><small>{student.modality}{student.modality==='Presencial'&&student.neighborhood?` • ${student.neighborhood}`:''}</small></div>
          <div className="ga-student-meta"><strong>{student.monthlyValue?`R$ ${student.monthlyValue}`:'Valor não informado'}</strong><small>{student.paymentDay?`Pagamento dia ${student.paymentDay}`:'Dia de pagamento não informado'}</small></div>
          <div className="ga-student-actions">{student.whatsapp&&<a target="_blank" href={wa(student.whatsapp,`Oi, ${student.name.split(' ')[0]}! Tudo bem?`)}>WhatsApp</a>}<button onClick={()=>open(student)}>Editar</button>{student.status==='active'&&<button className="release" onClick={()=>release(student)}>Liberar vaga</button>}</div>
        </article>)}
        {!students.length&&<div className="ga-empty students">Nenhum aluno cadastrado ainda. Clique em <strong>+ Cadastrar aluno</strong> para montar sua agenda atual.</div>}
      </div>}
    </section>

    {modal&&<div className="ga-modal-backdrop" onClick={()=>setModal(false)}><div className="ga-student-modal" onClick={e=>e.stopPropagation()}>
      <div className="ga-modal-head"><div><span>{form.id?'EDITAR ALUNO':'NOVO ALUNO'}</span><h2>{form.id?form.name:'Cadastrar aluno atual'}</h2></div><button onClick={()=>setModal(false)}>×</button></div>
      <form className="ga-student-form" onSubmit={submit}>
        <div className="ga-form-section"><strong>Dados do aluno</strong><div className="ga-form-grid"><label className="ga-field"><span>Nome *</span><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label className="ga-field"><span>WhatsApp</span><input inputMode="tel" value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})}/></label><label className="ga-field full"><span>E-mail</span><input type="email" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})}/></label></div></div>
        <div className="ga-form-section"><strong>Aula fixa</strong><div className="ga-form-grid three"><label className="ga-field"><span>Modalidade *</span><select value={form.modality} onChange={e=>setForm({...form,modality:e.target.value,monthlyValue:e.target.value==='Presencial'?'600':'500'})}><option>Online</option><option>Presencial</option></select></label><label className="ga-field"><span>Dia *</span><select value={form.day} onChange={e=>setForm({...form,day:e.target.value})}>{days.map(d=><option key={d}>{d}</option>)}</select></label><label className="ga-field"><span>Horário *</span><input type="time" required value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/></label></div></div>
        {form.modality==='Presencial'&&<div className="ga-form-section"><strong>Local da aula presencial</strong><div className="ga-form-grid"><label className="ga-field full"><span>Endereço</span><input value={form.address||''} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Rua, número, complemento..."/></label><label className="ga-field"><span>Bairro</span><input value={form.neighborhood||''} onChange={e=>setForm({...form,neighborhood:e.target.value})}/></label><label className="ga-field"><span>Cidade</span><input value={form.city||''} onChange={e=>setForm({...form,city:e.target.value})}/></label></div></div>}
        <div className="ga-form-section"><strong>Financeiro e observações</strong><div className="ga-form-grid"><label className="ga-field"><span>Mensalidade (R$)</span><input inputMode="decimal" value={form.monthlyValue||''} onChange={e=>setForm({...form,monthlyValue:e.target.value})}/></label><label className="ga-field"><span>Dia do pagamento</span><input inputMode="numeric" value={form.paymentDay||''} onChange={e=>setForm({...form,paymentDay:e.target.value})} placeholder="Ex.: 10"/></label><label className="ga-field full"><span>Observações</span><textarea value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Informações importantes sobre o aluno, reposições, acordos etc."/></label></div></div>
        {error&&<div className="ga-form-error">{error}</div>}
        <div className="ga-form-footer"><button type="button" className="secondary" onClick={()=>setModal(false)}>Cancelar</button><button className="ga-student-primary" disabled={saving}>{saving?'Salvando...':'Salvar aluno e ocupar horário'}</button></div>
      </form>
    </div></div>}
  </main>
}
