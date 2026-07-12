(()=>{
  if(!location.pathname.startsWith('/admin/whatsapp'))return

  const GROUPS=[
    {id:'120363404674461725@g.us',name:'LIVE - FOCO EM CANTO'},
    {id:'120363428159310476@g.us',name:'#2 LIVE - FOCO EM CANTO'},
  ]

  const previousSendNow=window.sendNow
  let selectedItemId=null

  function ensureModal(){
    if(document.getElementById('focoGroupSendModal'))return
    const modal=document.createElement('div')
    modal.id='focoGroupSendModal'
    modal.style.cssText='position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.78);backdrop-filter:blur(8px)'
    modal.innerHTML=`
      <div style="width:min(520px,100%);max-height:90vh;overflow:auto;border:1px solid rgba(168,85,247,.32);border-radius:24px;background:#10131c;box-shadow:0 30px 90px rgba(0,0,0,.58);padding:24px;color:#fff">
        <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px">
          <div><div style="font-size:12px;font-weight:900;letter-spacing:.12em;color:#c084fc;margin-bottom:7px">ENVIO MANUAL</div><h2 style="margin:0;font-size:24px">Escolha os grupos</h2><p style="margin:8px 0 0;color:rgba(255,255,255,.62);line-height:1.5">A mensagem será enviada somente para os grupos selecionados.</p></div>
          <button id="closeGroupSend" type="button" style="border:0;border-radius:12px;background:rgba(255,255,255,.08);color:#fff;width:38px;height:38px;font-size:20px;cursor:pointer">×</button>
        </div>
        <div id="groupSendItemTitle" style="padding:13px 14px;border-radius:14px;background:rgba(168,85,247,.10);border:1px solid rgba(168,85,247,.22);font-weight:800;margin-bottom:14px"></div>
        <div style="display:grid;gap:10px">
          ${GROUPS.map((g,i)=>`<label style="display:flex;gap:12px;align-items:center;padding:15px;border:1px solid rgba(255,255,255,.10);border-radius:15px;background:rgba(255,255,255,.035);cursor:pointer"><input class="foco-target-group" type="checkbox" value="${g.id}" ${i===0?'checked':''} style="width:19px;height:19px;accent-color:#8b5cf6"><span><strong style="display:block">${g.name}</strong><small style="color:rgba(255,255,255,.5)">${g.id}</small></span></label>`).join('')}
        </div>
        <div id="groupSendWarning" style="display:none;margin-top:13px;padding:11px 13px;border-radius:12px;background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.25);color:#fecaca"></div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;flex-wrap:wrap">
          <button id="cancelGroupSend" type="button" style="border:1px solid rgba(255,255,255,.12);border-radius:13px;background:rgba(255,255,255,.06);color:#fff;padding:12px 18px;font-weight:800;cursor:pointer">Cancelar</button>
          <button id="confirmGroupSend" type="button" style="border:0;border-radius:13px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;padding:12px 19px;font-weight:900;cursor:pointer">Enviar para selecionados</button>
        </div>
      </div>`
    document.body.appendChild(modal)
    const close=()=>{modal.style.display='none';selectedItemId=null}
    document.getElementById('closeGroupSend').onclick=close
    document.getElementById('cancelGroupSend').onclick=close
    modal.addEventListener('click',e=>{if(e.target===modal)close()})
    document.getElementById('confirmGroupSend').onclick=sendSelected
  }

  window.sendNow=function(id){
    ensureModal()
    selectedItemId=id
    const item=(window.load?.()||[]).find(x=>x.id===id)
    if(!item)return previousSendNow?.(id)
    document.getElementById('groupSendItemTitle').textContent=item.title||'Disparo sem título'
    document.getElementById('groupSendWarning').style.display='none'
    document.querySelectorAll('.foco-target-group').forEach(box=>box.checked=true)
    document.getElementById('focoGroupSendModal').style.display='flex'
  }

  async function sendSelected(){
    const items=window.load?.()||[]
    const item=items.find(x=>x.id===selectedItemId)
    if(!item)return
    const groups=[...document.querySelectorAll('.foco-target-group:checked')].map(x=>x.value)
    const warning=document.getElementById('groupSendWarning')
    if(!groups.length){warning.textContent='Selecione pelo menos um grupo.';warning.style.display='block';return}

    const button=document.getElementById('confirmGroupSend'),original=button.textContent
    button.disabled=true;button.textContent='Enviando...'
    try{
      const payload={groups}
      if(item.poll?.question)payload.poll=item.poll
      else {payload.text=String(item.message||'');if(item.imageUrl)payload.imageUrl=item.imageUrl}
      const response=await fetch('/api/admin/whatsapp/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      const data=await response.json().catch(()=>({}))
      if(!response.ok||!data.ok)throw new Error(data.message||'Falha no envio')

      item.delivery=item.delivery&&typeof item.delivery==='object'?item.delivery:{}
      const now=new Date().toISOString()
      groups.forEach(group=>{item.delivery[group]={ok:true,sentAt:now,manual:true}})
      const allKnown=GROUPS.every(group=>item.delivery[group.id]?.ok)
      item.status=allKnown?'ENVIADO':'PENDENTE'
      item.sentAt=allKnown?new Date().toLocaleString('pt-BR'):item.sentAt||null
      item.autoEnabled=allKnown?item.autoEnabled:false
      item.error=null
      item.updatedAt=now
      window.save?.(items)
      document.getElementById('focoGroupSendModal').style.display='none'
      selectedItemId=null
      window.showNotice?.(allKnown?'Disparo enviado para todos os grupos.':`Disparo enviado para ${groups.length} grupo(s). O automático deste card foi pausado para evitar duplicidade.`)
    }catch(error){
      warning.textContent='Não foi possível enviar: '+error.message
      warning.style.display='block'
    }finally{button.disabled=false;button.textContent=original}
  }

  ensureModal()
})()
