'use client'

import { FormEvent, useEffect, useState } from 'react'

type Student={id:string;name:string;whatsapp:string;email?:string;modality:string;address?:string;neighborhood?:string;city?:string;day:string;dayOrder:number;time:string;monthlyValue?:string;paymentDay?:string;notes?:string;color?:string;status:'active'|'inactive';createdAt?:string}
const days=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const colors=['#7427b9','#236da0','#168c8c','#26784d','#6d7f2b','#aa7220','#b85620','#ad386f','#873044']
const emptyStudent:Student={id:'',name:'',whatsapp:'',email:'',modality:'Online',address:'',neighborhood:'',city:'Salvador',day:'Segunda',dayOrder:1,time:'09:00',monthlyValue:'500',paymentDay:'10',notes:'',color:'#7427b9',status:'active'}
function wa(phone:string,message:string){const digits=phone.replace(/\D/g,'');const p=digits.startsWith('55')?digits:`55${digits}`;return `https://wa.me/${p}?text=${encodeURIComponent(message)}`}

export default function AlunosManagerV2(){
  const [students,setStudents]=useState<Student[]>([]),[loading,setLoading]=useState(true),[modal,setModal]=useState(false),[form,setForm]=useState<Student>({...emptyStudent}),[saving,setSaving]=useState(false),[error,setError]=useState('')
  async function load(){setLoading(true);const r=await fetch('/api/admin/alunos',{cache:'no-store'});if(r.ok){const d=await r.json();setStudents(Array.isArray(d.students)?d.students:[])}setLoading(false)}
  useEffect(()=>{load()},[])
  function open(student?:Student){setError('');setForm(student?{...student}:{...emptyStudent});setModal(true)}
  async function submit(e:FormEvent){e.preventDefault();setSaving(true);setError('');const r=await fetch('/api/admin/alunos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',student:{...form,dayOrder:days.indexOf(form.day)+1}})});const d=await r.json().catch(()=>({}));setSaving(false);if(!r.ok){setError(d.error||'Não foi possível salvar o aluno.');return}setModal(false);await load()}
  async function doRelease(student:Student){const r=await fetch('/api/admin/alunos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'release',id:student.id})});if(!r.ok){alert('Não foi possível liberar o horário.');return false}return true}
  async function release(student:Student){if(!confirm(`Liberar o horário de ${student.name}? O aluno será mantido no histórico.`))return;if(await doRelease(student))await load()}
  async function replace(student:Student){if(!confirm(`Substituir ${student.name}?\n\nO horário ${student.day} às ${student.time} será liberado e a lista de interesse abrirá já pronta para encontrar o melhor encaixe.`))return;if(await doRelease(student))window.location.href='/gestao/aulas/interesse/'}

  return <main className="ga-page">
    <header className="ga-top"><div><span>FOCO EM CANTO</span><h1>Alunos Particulares</h1></div><a href="/gestao/aulas/">← Voltar para agenda</a></header>
    <section className="ga-shell">
      <nav className="ga-tabs" style={{display:'flex',gap:8,marginBottom:20}}><a href="/gestao/aulas/" style={{textDecoration:'none',color:'#9ca5b1',padding:'12px 16px',border:'1px solid rgba(255,255,255,.09)',borderRadius:12,background:'#11151b',fontWeight:800}}>Agenda</a><a href="/gestao/aulas/alunos/" style={{textDecoration:'none',color:'#15110a',padding:'12px 16px',borderRadius:12,background:'#f2d092',fontWeight:800}}>Alunos</a><a href="/gestao/aulas/interesse/" style={{textDecoration:'none',color:'#9ca5b1',padding:'12px 16px',border:'1px solid rgba(255,255,255,.09)',borderRadius:12,background:'#11151b',fontWeight:800}}>Lista de interesse</a></nav>
      <div className="ga-student-toolbar"><div><strong>Base de alunos</strong><span>Edite horários, libere vagas ou encontre um substituto automaticamente.</span></div><button onClick={()=>open()}>+ Cadastrar aluno</button></div>
      {loading?<div className="ga-empty students">Carregando alunos...</div>:<div className="ga-student-list">
        {students.map(student=><article className="ga-student-card" key={student.id} style={{borderLeft:`4px solid ${student.color||'#7427b9'}`}}>
          <div className="ga-student-id"><span style={{background:student.color||'#242c36'}}>{(student.name||'A').charAt(0).toUpperCase()}</span><div><strong>{student.name}</strong><small>{student.whatsapp||'WhatsApp não informado'}{student.email?` • ${student.email}`:''}</small><i className={`ga-student-status ${student.status}`}>{student.status==='active'?'Ativo':'Inativo'}</i></div></div>
          <div className="ga-student-schedule"><strong>{student.day} • {student.time}</strong><small>{student.modality}{student.modality==='Presencial'&&student.neighborhood?` • ${student.neighborhood}`:''}</small></div>
          <div className="ga-student-meta"><strong>{student.monthlyValue?`R$ ${student.monthlyValue}`:'Valor não informado'}</strong><small>{student.paymentDay?`Pagamento dia ${student.paymentDay}`:'Dia de pagamento não informado'}</small></div>
          <div className="ga-student-actions">{student.whatsapp&&<a target="_blank" href={wa(student.whatsapp,`Oi, ${student.name.split(' ')[0]}! Tudo bem?`)}>WhatsApp</a>}<button onClick={()=>open(student)}>Editar</button>{student.status==='active'&&<><button className="release" onClick={()=>release(student)}>Liberar vaga</button><button onClick={()=>replace(student)} style={{background:'#efcc89',color:'#17120b',fontWeight:900}}>Buscar substituto</button></>}</div>
        </article>)}
        {!students.length&&<div className="ga-empty students">Nenhum aluno cadastrado ainda.</div>}
      </div>}
    </section>

    {modal&&<div className="ga-modal-backdrop" onClick={()=>setModal(false)}><div className="ga-student-modal" onClick={e=>e.stopPropagation()}>
      <div className="ga-modal-head"><div><span>{form.id?'EDITAR ALUNO':'NOVO ALUNO'}</span><h2>{form.id?form.name:'Cadastrar aluno atual'}</h2></div><button onClick={()=>setModal(false)}>×</button></div>
      <form className="ga-student-form" onSubmit={submit}>
        <div className="ga-form-section"><strong>Dados do aluno</strong><div className="ga-form-grid"><label className="ga-field"><span>Nome *</span><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label className="ga-field"><span>WhatsApp</span><input inputMode="tel" value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})}/></label><label className="ga-field full"><span>E-mail</span><input type="email" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})}/></label></div></div>
        <div className="ga-form-section"><strong>Aula fixa</strong><div className="ga-form-grid three"><label className="ga-field"><span>Modalidade *</span><select value={form.modality} onChange={e=>setForm({...form,modality:e.target.value,monthlyValue:e.target.value==='Presencial'?'600':'500'})}><option>Online</option><option>Presencial</option></select></label><label className="ga-field"><span>Dia *</span><select value={form.day} onChange={e=>setForm({...form,day:e.target.value})}>{days.map(d=><option key={d}>{d}</option>)}</select></label><label className="ga-field"><span>Horário *</span><input type="time" required value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/></label></div></div>
        {form.modality==='Presencial'&&<div className="ga-form-section"><strong>Local da aula presencial</strong><div className="ga-form-grid"><label className="ga-field full"><span>Endereço</span><input value={form.address||''} onChange={e=>setForm({...form,address:e.target.value})}/></label><label className="ga-field"><span>Bairro</span><input value={form.neighborhood||''} onChange={e=>setForm({...form,neighborhood:e.target.value})}/></label><label className="ga-field"><span>Cidade</span><input value={form.city||''} onChange={e=>setForm({...form,city:e.target.value})}/></label></div></div>}
        <div className="ga-form-section"><strong>Financeiro e observações</strong><div className="ga-form-grid"><label className="ga-field"><span>Mensalidade (R$)</span><input value={form.monthlyValue||''} onChange={e=>setForm({...form,monthlyValue:e.target.value})}/></label><label className="ga-field"><span>Dia do pagamento</span><input value={form.paymentDay||''} onChange={e=>setForm({...form,paymentDay:e.target.value})}/></label><label className="ga-field full"><span>Observações</span><textarea value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></label></div></div>
        <div className="ga-form-section"><strong>Cor na agenda</strong><div style={{display:'flex',gap:9,flexWrap:'wrap',marginTop:10}}>{colors.map(c=><button key={c} type="button" onClick={()=>setForm({...form,color:c})} style={{width:34,height:34,borderRadius:99,background:c,border:form.color===c?'3px solid #fff':'1px solid rgba(255,255,255,.25)',cursor:'pointer'}}/>)}</div></div>
        {error&&<div className="ga-form-error">{error}</div>}
        <div className="ga-form-footer"><button type="button" className="secondary" onClick={()=>setModal(false)}>Cancelar</button><button className="ga-student-primary" disabled={saving}>{saving?'Salvando...':'Salvar aluno e ocupar horário'}</button></div>
      </form>
    </div></div>}
  </main>
}
