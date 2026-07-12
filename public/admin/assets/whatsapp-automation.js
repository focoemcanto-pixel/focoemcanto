(()=>{
  if(!location.pathname.startsWith('/admin/whatsapp'))return
  const $=s=>document.querySelector(s)
  const esc=v=>String(v||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
  let state=null

  async function api(body){
    const res=await fetch('/api/admin/whatsapp/automation',{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined})
    const data=await res.json().catch(()=>({}))
    if(!res.ok||!data.ok)throw new Error(data.message||'Falha ao consultar automação')
    return data
  }

  function fmtDate(value){if(!value)return 'Nunca';try{return new Date(value).toLocaleString('pt-BR')}catch{return value}}
  function nextText(item){return item?`${item.title} · ${item.date} às ${item.time}`:'Nenhum disparo futuro ativo'}

  function inject(){
    if($('#automationControl'))return
    const anchor=$('.stats')||$('.layout')
    if(!anchor)return
    const box=document.createElement('section');box.id='automationControl';box.className='panel';box.style.cssText='margin-bottom:18px;padding:20px;border:1px solid rgba(168,85,247,.28);background:linear-gradient(145deg,rgba(168,85,247,.10),rgba(255,255,255,.025))'
    box.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap"><div><div style="display:flex;align-items:center;gap:10px"><span id="automationDot" style="width:10px;height:10px;border-radius:50%;background:#64748b"></span><h2 style="margin:0">Automação de disparos</h2></div><p id="automationSummary" class="muted" style="margin:8px 0 0">Verificando o serviço...</p></div><div class="actions"><button id="runAutomationNow" class="btn secondary">Verificar agora</button><button id="toggleAutomation" class="btn primary">Carregando...</button></div></div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:16px" class="automation-grid"><div class="card"><span>Última verificação</span><strong id="automationLast" style="font-size:16px">—</strong></div><div class="card"><span>Próximo disparo</span><strong id="automationNext" style="font-size:16px;line-height:1.35">—</strong></div><div class="card"><span>Estado do motor</span><strong id="automationHealth" style="font-size:16px">—</strong></div></div>`
    anchor.before(box)
    const style=document.createElement('style');style.textContent='@media(max-width:760px){.automation-grid{grid-template-columns:1fr!important}} .auto-paused{opacity:.62}.auto-pill{display:inline-flex;padding:6px 9px;border-radius:999px;font-size:11px;font-weight:900;border:1px solid rgba(255,255,255,.12);margin-left:8px}.auto-on{color:#bbf7d0;background:rgba(34,197,94,.12)}.auto-off{color:#fde68a;background:rgba(244,200,75,.12)}';document.head.appendChild(style)
    $('#toggleAutomation').onclick=toggleGlobal
    $('#runAutomationNow').onclick=runNow
  }

  async function refreshState(){
    inject()
    try{state=await api();renderState()}catch(e){$('#automationSummary').textContent=e.message;$('#automationHealth').textContent='Indisponível'}
  }
  function renderState(){
    const on=state.enabled!==false
    $('#automationDot').style.background=on?'#22c55e':'#ef4444'
    $('#automationSummary').textContent=on?'Ativa: disparos individuais habilitados podem ser enviados no horário.':'Pausada: nenhum disparo automático será executado.'
    $('#toggleAutomation').textContent=on?'Pausar automação':'Ativar automação'
    $('#automationLast').textContent=fmtDate(state.lastRunAt)
    $('#automationNext').textContent=nextText(state.nextItem)
    $('#automationHealth').textContent=state.lastRunStatus==='ERRO'?'Erro na última execução':state.lastRunStatus==='OK'?'Funcionando':'Aguardando primeira execução'
  }
  async function toggleGlobal(){const btn=$('#toggleAutomation');btn.disabled=true;try{state=await api({action:'toggle',enabled:!(state?.enabled!==false)});renderState();window.showNotice?.(state.enabled?'Automação ativada.':'Automação pausada.')}catch(e){window.showNotice?.(e.message,false)}finally{btn.disabled=false}}
  async function runNow(){const btn=$('#runAutomationNow');btn.disabled=true;btn.textContent='Verificando...';try{const data=await api({action:'run'});window.showNotice?.(`${data.processed||0} disparo(s) processado(s).`);await refreshState();window.loadRemoteSchedule?.()}catch(e){window.showNotice?.(e.message,false)}finally{btn.disabled=false;btn.textContent='Verificar agora'}}

  function decorateCards(){
    const items=window.load?.()||[]
    document.querySelectorAll('#list .message').forEach(card=>{
      card.querySelector('.auto-toggle-btn')?.remove();card.querySelector('.auto-pill')?.remove();card.classList.remove('auto-paused')
      const title=card.querySelector('.day')?.textContent||''
      const item=items.find(x=>title.includes(x.title));if(!item)return
      const enabled=item.autoEnabled!==false
      const pill=document.createElement('span');pill.className=`auto-pill ${enabled?'auto-on':'auto-off'}`;pill.textContent=enabled?'AUTOMÁTICO':'PAUSADO'
      card.querySelector('.time')?.appendChild(pill)
      if(!enabled)card.classList.add('auto-paused')
      const actions=card.querySelector('.actions');if(actions){const btn=document.createElement('button');btn.className='ghost auto-toggle-btn';btn.textContent=enabled?'Pausar disparo':'Ativar disparo';btn.onclick=()=>toggleItem(item.id);actions.prepend(btn)}
    })
  }
  function toggleItem(id){const items=window.load?.()||[],item=items.find(x=>x.id===id);if(!item)return;item.autoEnabled=item.autoEnabled===false;item.updatedAt=new Date().toISOString();window.save?.(items);window.showNotice?.(item.autoEnabled?'Disparo ativado para automação.':'Disparo pausado.');setTimeout(refreshState,250)}

  const oldRender=window.render;window.render=function(){oldRender?.();setTimeout(decorateCards,20)}
  setTimeout(()=>{inject();refreshState();decorateCards();setInterval(refreshState,60000)},250)
})()
