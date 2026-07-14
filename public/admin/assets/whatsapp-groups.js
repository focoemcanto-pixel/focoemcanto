(()=>{
  if(!location.pathname.startsWith('/admin/whatsapp'))return
  const $=s=>document.querySelector(s)
  const esc=v=>String(v||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
  let groups=[]

  async function api(body){
    const response=await fetch('/api/admin/whatsapp/groups',{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'})
    const data=await response.json().catch(()=>({}))
    if(!response.ok||!data.ok)throw new Error(data.message||'Falha ao atualizar grupos.')
    return data
  }

  function ensurePanel(){
    if($('#focoGroupManager'))return
    const old=[...document.querySelectorAll('.groups')].find(el=>el.closest('.panel'))
    const anchor=old?.parentElement
    if(!anchor)return
    const box=document.createElement('section')
    box.id='focoGroupManager'
    box.style.cssText='margin-top:18px;padding:16px;border-radius:18px;border:1px solid rgba(168,85,247,.24);background:rgba(168,85,247,.07)'
    box.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><strong>Gerenciar grupos</strong><div class="muted" style="margin-top:5px">Desconecte ou reconecte um grupo no Foco OS sem alterar a sessão da WaSender.</div></div><button id="refreshFocoGroups" class="ghost" type="button">Atualizar</button></div><div id="focoGroupList" style="display:grid;gap:10px;margin-top:14px"></div>'
    anchor.appendChild(box)
    old.style.display='none'
    $('#refreshFocoGroups').onclick=load
  }

  function render(){
    const list=$('#focoGroupList');if(!list)return
    list.innerHTML=groups.map((group,index)=>`<div style="padding:13px;border-radius:15px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.035)"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><strong>${esc(group.name)}</strong><div class="gid">${esc(group.id)}</div><div style="margin-top:7px;font-size:12px;color:${group.enabled?'#bbf7d0':'#fde68a'}">${group.enabled?'● Conectado no Foco OS':'○ Desconectado do Foco OS'}</div></div><button class="ghost ${group.enabled?'danger':'success'}" data-index="${index}" type="button">${group.enabled?'Desconectar':'Reconectar'}</button></div></div>`).join('')
    list.querySelectorAll('[data-index]').forEach(button=>button.onclick=()=>toggle(Number(button.dataset.index)))
  }

  async function load(){
    ensurePanel()
    try{groups=(await api()).groups||[];render()}catch(error){window.showNotice?.(error.message,false)}
  }

  async function toggle(index){
    const group=groups[index];if(!group)return
    if(group.enabled){
      if(!confirm(`Desconectar ${group.name} do Foco OS? Os próximos disparos não serão enviados para este grupo até a reconexão.`))return
      group.enabled=false
      try{groups=(await api({groups,applyToPending:true})).groups;render();window.showNotice?.(`${group.name} foi desconectado do Foco OS.`)}catch(error){group.enabled=true;window.showNotice?.(error.message,false)}
      return
    }
    const id=prompt('Confirme ou atualize o ID do grupo antes de reconectar:',group.id)
    if(!id)return
    const name=prompt('Nome do grupo:',group.name)||group.name
    group.id=id.trim();group.name=name.trim();group.enabled=true;group.reconnectedAt=new Date().toISOString()
    try{groups=(await api({groups,applyToPending:true,reconnectIds:[group.id]})).groups;render();window.showNotice?.(`${group.name} foi reconectado. Os disparos pendentes foram atualizados.`)}catch(error){group.enabled=false;window.showNotice?.(error.message,false)}
  }

  setTimeout(load,700)
})()
