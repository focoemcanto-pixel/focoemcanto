(()=>{
  if(!location.pathname.startsWith('/admin/whatsapp'))return

  const STORAGE_KEY='foco_os_whatsapp_schedule_v1'
  const LOG_KEY='foco_os_whatsapp_send_logs_v1'
  const GROUPS=[
    {id:'120363404674461725@g.us',name:'LIVE - FOCO EM CANTO'},
    {id:'120363428159310476@g.us',name:'#2 LIVE - FOCO EM CANTO'},
  ]
  const previousSendNow=window.sendNow
  let selectedItemId=null

  function readItems(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]}catch{return[]}}
  function readLogs(){try{return JSON.parse(localStorage.getItem(LOG_KEY))||[]}catch{return[]}}
  function addLog(entry){
    const logs=[{id:crypto.randomUUID?.()||String(Date.now()),at:new Date().toISOString(),...entry},...readLogs()].slice(0,30)
    localStorage.setItem(LOG_KEY,JSON.stringify(logs));renderLogs()
  }
  function groupName(id){return GROUPS.find(g=>g.id===id)?.name||id}
  function formatDate(value){try{return new Date(value).toLocaleString('pt-BR')}catch{return value}}

  function ensureLogs(){
    if(document.getElementById('focoSendLogs'))return
    const panels=[...document.querySelectorAll('.panel')]
    const target=panels.find(p=>p.textContent.includes('Disparos programados'))
    if(!target)return
    const box=document.createElement('section')
    box.id='focoSendLogs'
    box.style.cssText='margin-top:18px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.10);background:rgba(10,12,19,.72)'
    box.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px"><div><strong style="font-size:16px">Histórico de envios</strong><div class="muted" style="margin-top:4px">Confirmações e erros dos disparos manuais.</div></div><button id="clearSendLogs" class="ghost" type="button">Limpar logs</button></div><div id="focoSendLogsList"></div>'
    target.appendChild(box)
    document.getElementById('clearSendLogs').onclick=()=>{localStorage.removeItem(LOG_KEY);renderLogs()}
    renderLogs()
  }
  function renderLogs(){
    const list=document.getElementById('focoSendLogsList');if(!list)return
    const logs=readLogs()
    if(!logs.length){list.innerHTML='<div class="muted">Nenhum envio manual registrado ainda.</div>';return}
    list.innerHTML=logs.map(log=>`<div style="padding:12px 0;border-top:1px solid rgba(255,255,255,.08)"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><strong style="color:${log.ok?'#bbf7d0':'#fecaca'}">${log.ok?'✓ Enviado':'✕ Falhou'}</strong><span class="muted" style="font-size:12px">${formatDate(log.at)}</span></div><div style="margin-top:5px">${escapeHtml(log.title||'Disparo')}</div><div class="muted" style="font-size:12px;margin-top:4px">${escapeHtml((log.groups||[]).map(groupName).join(', '))}${log.message?' · '+escapeHtml(log.message):''}</div></div>`).join('')
  }

  function ensureModal(){
    if(document.getElementById('focoGroupSendModal'))return
    const modal=document.createElement('div')
    modal.id='focoGroupSendModal'
    modal.style.cssText='position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.78);backdrop-filter:blur(8px)'
    modal.innerHTML=`<div style="width:min(540px,100%);max-height:90vh;overflow:auto;border:1px solid rgba(168,85,247,.32);border-radius:24px;background:#10131c;box-shadow:0 30px 90px rgba(0,0,0,.58);padding:24px;color:#fff"><div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px"><div><div style="font-size:12px;font-weight:900;letter-spacing:.12em;color:#c084fc;margin-bottom:7px">ENVIO MANUAL</div><h2 style="margin:0;font-size:24px">Escolha os grupos</h2><p style="margin:8px 0 0;color:rgba(255,255,255,.62);line-height:1.5">O disparo será enviado somente aos grupos marcados.</p></div><button id="closeGroupSend" type="button" style="border:0;border-radius:12px;background:rgba(255,255,255,.08);color:#fff;width:38px;height:38px;font-size:20px;cursor:pointer">×</button></div><div id="groupSendItemTitle" style="padding:13px 14px;border-radius:14px;background:rgba(168,85,247,.10);border:1px solid rgba(168,85,247,.22);font-weight:800;margin-bottom:14px"></div><div style="display:grid;gap:10px">${GROUPS.map(g=>`<label style="display:flex;gap:12px;align-items:center;padding:15px;border:1px solid rgba(255,255,255,.10);border-radius:15px;background:rgba(255,255,255,.035);cursor:pointer"><input class="foco-target-group" type="checkbox" value="${g.id}" style="width:19px;height:19px;accent-color:#8b5cf6"><span><strong style="display:block">${g.name}</strong><small style="color:rgba(255,255,255,.5)">${g.id}</small></span></label>`).join('')}</div><div id="groupSendStatus" style="display:none;margin-top:13px;padding:12px 14px;border-radius:12px"></div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;flex-wrap:wrap"><button id="cancelGroupSend" type="button" class="ghost">Cancelar</button><button id="confirmGroupSend" type="button" class="btn primary">Enviar para selecionados</button></div></div>`
    document.body.appendChild(modal)
    const close=()=>{modal.style.display='none';selectedItemId=null}
    document.getElementById('closeGroupSend').onclick=close
    document.getElementById('cancelGroupSend').onclick=close
    modal.addEventListener('click',e=>{if(e.target===modal)close()})
    document.getElementById('confirmGroupSend').onclick=sendSelected
  }

  function setModalStatus(text,ok=false){
    const el=document.getElementById('groupSendStatus');if(!el)return
    el.textContent=text;el.style.display='block';el.style.color=ok?'#bbf7d0':'#fecaca';el.style.background=ok?'rgba(34,197,94,.10)':'rgba(239,68,68,.10)';el.style.border=`1px solid ${ok?'rgba(34,197,94,.28)':'rgba(239,68,68,.28)'}`
  }

  window.sendNow=function(id){
    ensureModal();ensureLogs();selectedItemId=id
    const item=readItems().find(x=>x.id===id)
    if(!item)return previousSendNow?.(id)
    document.getElementById('groupSendItemTitle').textContent=item.title||'Disparo sem título'
    document.getElementById('groupSendStatus').style.display='none'
    document.querySelectorAll('.foco-target-group').forEach(box=>{box.checked=!item.delivery?.[box.value]?.ok})
    if(!document.querySelector('.foco-target-group:checked'))document.querySelectorAll('.foco-target-group').forEach(box=>box.checked=true)
    document.getElementById('focoGroupSendModal').style.display='flex'
  }

  async function persist(items){
    localStorage.setItem(STORAGE_KEY,JSON.stringify(items))
    window.render?.()
    const response=await fetch('/api/whatsapp/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})})
    const data=await response.json().catch(()=>({}))
    if(!response.ok||!data.ok)throw new Error(data.message||'O envio ocorreu, mas não foi possível atualizar a agenda.')
    return data
  }

  async function sendSelected(){
    const items=readItems(),item=items.find(x=>x.id===selectedItemId)
    if(!item)return setModalStatus('O disparo não foi encontrado. Atualize a página e tente novamente.')
    const groups=[...document.querySelectorAll('.foco-target-group:checked')].map(x=>x.value)
    if(!groups.length)return setModalStatus('Selecione pelo menos um grupo.')
    const button=document.getElementById('confirmGroupSend'),original=button.textContent
    button.disabled=true;button.textContent='Enviando...';setModalStatus('Enviando. Aguarde a confirmação...',true)
    try{
      const payload={groups}
      if(item.poll?.question)payload.poll=item.poll
      else{payload.text=String(item.message||'');if(item.imageUrl)payload.imageUrl=item.imageUrl}
      const response=await fetch('/api/admin/whatsapp/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      const data=await response.json().catch(()=>({}))
      const successful=(data.results||[]).filter(r=>r.ok).map(r=>r.group)
      const failed=(data.results||[]).filter(r=>!r.ok)
      if(!response.ok||!data.ok||successful.length!==groups.length){
        const detail=failed.map(r=>`${groupName(r.group)} (${r.status||'erro'})`).join(', ')
        throw new Error(data.message+(detail?' — '+detail:'' )||'Falha no envio')
      }
      const now=new Date().toISOString()
      item.delivery=item.delivery&&typeof item.delivery==='object'?item.delivery:{}
      successful.forEach(group=>{item.delivery[group]={ok:true,sentAt:now,manual:true}})
      item.status='ENVIADO'
      item.sentAt=new Date().toLocaleString('pt-BR')
      item.autoEnabled=false
      item.manualTargets=groups
      item.error=null;item.updatedAt=now
      await persist(items)
      addLog({ok:true,title:item.title,groups,message:'Confirmação recebida da API'})
      setModalStatus(`Enviado com sucesso para ${groups.map(groupName).join(' e ')}.`,true)
      window.showNotice?.(`✓ Disparo confirmado para ${groups.length} grupo(s).`)
      setTimeout(()=>{document.getElementById('focoGroupSendModal').style.display='none';selectedItemId=null;window.refreshWhatsappSchedule?.().catch(()=>{})},1300)
    }catch(error){
      addLog({ok:false,title:item.title,groups,message:error.message})
      setModalStatus('Não foi possível enviar: '+error.message)
      window.showNotice?.('Falha no disparo: '+error.message,false)
    }finally{button.disabled=false;button.textContent=original}
  }

  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  ensureModal();setTimeout(ensureLogs,300)
})()