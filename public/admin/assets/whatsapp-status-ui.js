(()=>{
  if(!location.pathname.startsWith('/admin/whatsapp'))return
  const GROUPS=[
    {id:'120363404674461725@g.us',name:'LIVE - FOCO EM CANTO'},
    {id:'120363428159310476@g.us',name:'#2 LIVE - FOCO EM CANTO'},
  ]
  const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const statusMeta={
    PENDENTE:{label:'PENDENTE',color:'#fde68a',bg:'rgba(244,200,75,.12)'},
    PROCESSANDO:{label:'PROCESSANDO',color:'#bfdbfe',bg:'rgba(59,130,246,.13)'},
    PARCIAL:{label:'PARCIAL',color:'#fdba74',bg:'rgba(249,115,22,.13)'},
    ENVIADO:{label:'ACEITO NOS GRUPOS',color:'#bbf7d0',bg:'rgba(34,197,94,.12)'},
    ERRO:{label:'ERRO',color:'#fecaca',bg:'rgba(239,68,68,.12)'},
  }

  function items(){return window.load?.()||[]}
  function getExpected(item){return Array.isArray(item.groups)&&item.groups.length?item.groups:GROUPS.map(g=>g.id)}
  function decorateStats(){
    const list=items()
    const counts={PENDENTE:0,PROCESSANDO:0,PARCIAL:0,ENVIADO:0,ERRO:0}
    list.forEach(x=>{if(counts[x.status]!==undefined)counts[x.status]++})
    const total=document.getElementById('statTotal'),pending=document.getElementById('statPending'),sent=document.getElementById('statSent'),error=document.getElementById('statError')
    if(total)total.textContent=list.length
    if(pending)pending.textContent=counts.PENDENTE+counts.PROCESSANDO+counts.PARCIAL
    if(sent)sent.textContent=counts.ENVIADO
    if(error)error.textContent=counts.ERRO
    const cards=[...document.querySelectorAll('.stats .card')]
    if(cards[1])cards[1].querySelector('span').textContent='Aguardando / parcial'
    if(cards[2])cards[2].querySelector('span').textContent='Aceitos nos grupos'
  }

  function ensureFilters(){
    const filters=document.querySelector('.foco-planner-filters');if(!filters)return
    if(!filters.querySelector('[data-status="PARCIAL"]')){
      const partial=document.createElement('button');partial.className='foco-planner-filter';partial.dataset.status='PARCIAL';partial.textContent='Parciais';filters.insertBefore(partial,filters.querySelector('[data-type]'))
      const processing=document.createElement('button');processing.className='foco-planner-filter';processing.dataset.status='PROCESSANDO';processing.textContent='Processando';filters.insertBefore(processing,filters.querySelector('[data-type]'))
      ;[partial,processing].forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.foco-planner-filter[data-status]').forEach(x=>x.classList.toggle('active',x===btn));const wanted=btn.dataset.status;const sorted=items().slice().sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));document.querySelectorAll('#list .message').forEach((card,i)=>{card.style.display=sorted[i]?.status===wanted?'':'none'})})
    }
  }

  function decorateCards(){
    const sorted=items().slice().sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))
    document.querySelectorAll('#list .message').forEach((card,index)=>{
      const item=sorted[index];if(!item)return
      card.querySelector('.foco-delivery-detail')?.remove()
      const oldBadge=card.querySelector('.badge:not(.auto-pill)')
      const meta=statusMeta[item.status]||statusMeta.PENDENTE
      if(oldBadge){oldBadge.textContent=meta.label;oldBadge.style.color=meta.color;oldBadge.style.background=meta.bg}
      const expected=getExpected(item)
      const deliveries=item.deliveries||{}
      const detail=document.createElement('div');detail.className='foco-delivery-detail';detail.style.cssText='display:grid;gap:7px;margin:12px 0;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.025)'
      detail.innerHTML=expected.map(id=>{const group=GROUPS.find(g=>g.id===id);const d=deliveries[id];const state=d?.ok?'✓ Aceito pela API':d?.attempts?`✕ Falhou · tentativa ${d.attempts}/3`:'○ Aguardando';const color=d?.ok?'#bbf7d0':d?.attempts?'#fecaca':'rgba(255,255,255,.55)';return `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><span>${esc(group?.name||id)}</span><strong style="font-size:12px;color:${color}">${esc(state)}</strong></div>`}).join('')
      const actions=card.querySelector('.actions');if(actions)card.insertBefore(detail,actions);else card.appendChild(detail)
      if(item.error){const err=document.createElement('div');err.style.cssText='color:#fecaca;font-size:12px;margin-top:5px';err.textContent=item.error;detail.appendChild(err)}
    })
  }

  function ensureTestButton(){
    const actions=document.querySelector('#automationControl .actions');if(!actions||document.getElementById('createAutomationTest'))return
    const btn=document.createElement('button');btn.id='createAutomationTest';btn.className='btn secondary';btn.textContent='Criar teste +2 min';actions.prepend(btn)
    btn.onclick=async()=>{
      if(!confirm('Criar um disparo de teste para os dois grupos, programado para daqui a 2 minutos? Ele só será enviado se a automação geral estiver ativa.'))return
      const now=new Date(Date.now()+2*60*1000),date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),time=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(now)
      const next=[...items(),{id:crypto.randomUUID(),date,time,title:'Teste automático de confiabilidade',message:'✅ Teste automático do Foco OS. Esta mensagem confirma que o agendador está funcionando corretamente.',status:'PENDENTE',sentAt:null,error:null,source:'system-test',groups:GROUPS.map(g=>g.id),autoEnabled:true,deliveries:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]
      btn.disabled=true
      try{await window.save?.(next);window.showNotice?.(`Teste criado para ${date} às ${time}. Ative a automação para executá-lo.`)}catch(e){window.showNotice?.(e.message||'Não foi possível criar o teste.',false)}finally{btn.disabled=false}
    }
  }

  function refresh(){decorateStats();ensureFilters();decorateCards();ensureTestButton()}
  const previous=window.render;window.render=function(){previous?.();setTimeout(refresh,60)}
  setTimeout(refresh,500);setInterval(refresh,15000)
})()