(()=>{
  if(!location.pathname.startsWith('/admin/whatsapp'))return
  const state={mode:'week',cursor:new Date(),status:'ALL',type:'ALL'}
  const $=s=>document.querySelector(s)
  const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const dateOnly=d=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)}
  const add=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x}
  const monday=d=>{const x=new Date(d);const day=x.getDay()||7;x.setHours(12,0,0,0);x.setDate(x.getDate()-day+1);return x}
  const fmt=d=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(d)
  const monthFmt=d=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(d)
  function items(){return window.load?.()||[]}
  function persist(data,msg){window.save?.(data);window.showNotice?.(msg||'Programação atualizada.')}
  function init(){
    const stats=$('.stats');if(!stats||$('#focoPlanner'))return
    const el=document.createElement('section');el.id='focoPlanner';el.className='foco-planner';el.innerHTML=`
      <div class="foco-planner-top">
        <div class="foco-planner-card">
          <div class="foco-planner-row" style="justify-content:space-between"><div><h2 class="foco-planner-title">Central de programação</h2><p class="foco-planner-sub">Organize os disparos por semana ou acompanhe todo o mês.</p></div><div class="foco-planner-tabs"><button class="foco-planner-tab active" data-mode="week">Semana</button><button class="foco-planner-tab" data-mode="month">Mês</button></div></div>
          <div class="foco-planner-nav"><div class="foco-planner-row"><button class="foco-planner-btn" id="plannerPrev">←</button><button class="foco-planner-btn" id="plannerToday">Hoje</button><button class="foco-planner-btn" id="plannerNext">→</button></div><div class="foco-planner-range" id="plannerRange"></div><div class="foco-planner-row"><button class="foco-planner-btn" id="duplicateWeek">Duplicar semana</button><button class="foco-planner-btn primary" id="newSchedule">Nova programação</button></div></div>
          <div class="foco-planner-filters"><button class="foco-planner-filter active" data-status="ALL">Todos</button><button class="foco-planner-filter" data-status="PENDENTE">Pendentes</button><button class="foco-planner-filter" data-status="ENVIADO">Enviados</button><button class="foco-planner-filter" data-type="poll">Enquetes</button><button class="foco-planner-filter" data-type="media">Com mídia</button></div>
        </div>
        <div class="foco-planner-card foco-ai-box">
          <div><h2 class="foco-planner-title">✦ Planejador IA</h2><p class="foco-planner-sub">Converse sobre a semana e execute ações com sua aprovação.</p></div>
          <textarea class="foco-ai-input" id="plannerCommand" placeholder="Ex.: Duplique esta programação para a próxima semana e troque o tema para extensão vocal."></textarea>
          <div class="foco-ai-chips"><button class="foco-ai-chip">Duplicar esta semana</button><button class="foco-ai-chip">Criar próxima semana</button><button class="foco-ai-chip">Mostrar só pendentes</button><button class="foco-ai-chip">Planejar o mês</button></div>
          <button class="foco-planner-btn primary" id="runPlannerCommand">Analisar comando</button><div class="foco-ai-result" id="plannerResult"></div>
        </div>
      </div><div class="foco-month" id="plannerMonth"></div>`
    stats.before(el)
    bind();refresh()
  }
  function bind(){
    document.querySelectorAll('.foco-planner-tab').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;document.querySelectorAll('.foco-planner-tab').forEach(x=>x.classList.toggle('active',x===b));refresh()})
    $('#plannerPrev').onclick=()=>{state.cursor=add(state.cursor,state.mode==='week'?-7:-30);refresh()}
    $('#plannerNext').onclick=()=>{state.cursor=add(state.cursor,state.mode==='week'?7:30);refresh()}
    $('#plannerToday').onclick=()=>{state.cursor=new Date();refresh()}
    $('#newSchedule').onclick=()=>{$('.layout')?.scrollIntoView({behavior:'smooth',block:'start'})}
    $('#duplicateWeek').onclick=()=>duplicateCurrentWeek()
    document.querySelectorAll('.foco-planner-filter').forEach(b=>b.onclick=()=>{
      if(b.dataset.status){state.status=b.dataset.status;document.querySelectorAll('[data-status]').forEach(x=>x.classList.toggle('active',x===b))}
      if(b.dataset.type){state.type=state.type===b.dataset.type?'ALL':b.dataset.type;b.classList.toggle('active',state.type===b.dataset.type)}
      applyFilters();renderMonth()
    })
    document.querySelectorAll('.foco-ai-chip').forEach(b=>b.onclick=()=>{$('#plannerCommand').value=b.textContent;runCommand()})
    $('#runPlannerCommand').onclick=runCommand
  }
  function range(){const start=monday(state.cursor);return{start,end:add(start,6)}}
  function refresh(){
    document.body.classList.toggle('foco-month-mode',state.mode==='month');document.body.classList.toggle('foco-week-mode',state.mode==='week')
    const r=range();$('#plannerRange').textContent=state.mode==='week'?`${fmt(r.start)} — ${fmt(r.end)}`:monthFmt(state.cursor)
    applyFilters();renderMonth()
  }
  function matches(x){
    if(state.status!=='ALL'&&x.status!==state.status)return false
    if(state.type==='poll'&&!x.poll)return false
    if(state.type==='media'&&!x.imageUrl)return false
    if(state.mode==='week'){const r=range(),d=new Date(x.date+'T12:00:00');return d>=r.start&&d<=r.end}
    return true
  }
  function applyFilters(){
    if(state.mode!=='week')return
    const sorted=items().slice().sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))
    document.querySelectorAll('#list .message').forEach((card,i)=>{const x=sorted[i];card.style.display=x&&matches(x)?'':'none'})
  }
  function renderMonth(){
    const box=$('#plannerMonth');if(!box)return
    if(state.mode!=='month'){box.innerHTML='';return}
    const y=state.cursor.getFullYear(),m=state.cursor.getMonth(),first=new Date(y,m,1,12),start=monday(first),monthItems=items().filter(x=>{const d=new Date(x.date+'T12:00:00');return d.getFullYear()===y&&d.getMonth()===m&&matches({...x})})
    let html=''
    for(let i=0;i<42;i++){
      const d=add(start,i),key=dateOnly(d),dayItems=monthItems.filter(x=>x.date===key),out=d.getMonth()!==m
      html+=`<div class="foco-month-day${out?' out':''}"><div class="foco-month-number">${d.getDate()}</div>${dayItems.map(x=>`<button class="foco-month-event ${x.status==='ENVIADO'?'sent':x.status==='ERRO'?'error':''}" data-id="${esc(x.id)}">${esc(x.time)} · ${esc(x.title)}</button>`).join('')}</div>`
    }
    box.innerHTML=html
    box.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>window.editMessage?.(b.dataset.id))
  }
  function duplicateCurrentWeek(){
    const r=range(),source=items().filter(x=>{const d=new Date(x.date+'T12:00:00');return d>=r.start&&d<=r.end})
    if(!source.length)return window.showNotice?.('Não há disparos nesta semana.',false)
    if(!confirm(`Duplicar ${source.length} disparos para a próxima semana?`))return
    const all=items(),copies=source.map(x=>({...x,id:crypto.randomUUID(),date:dateOnly(add(new Date(x.date+'T12:00:00'),7)),title:x.title.replace(/ — cópia$/,''),status:'PENDENTE',sentAt:null,error:null,source:'duplicated',createdAt:new Date().toISOString()}))
    persist([...all,...copies],'Semana duplicada com sucesso.');state.cursor=add(state.cursor,7);setTimeout(refresh,50)
  }
  async function runCommand(){
    const input=$('#plannerCommand'),result=$('#plannerResult'),command=input.value.trim();if(!command)return
    result.style.display='block';result.textContent='Analisando a programação...'
    try{
      const lower=command.toLowerCase()
      if(lower.includes('duplic')){duplicateCurrentWeek();result.textContent='A programação foi duplicada para a próxima semana e ficou como pendente para revisão.';return}
      if(lower.includes('pendente')){state.status='PENDENTE';document.querySelectorAll('[data-status]').forEach(x=>x.classList.toggle('active',x.dataset.status==='PENDENTE'));refresh();result.textContent='Mostrando somente os disparos pendentes desta programação.';return}
      if(lower.includes('mês')||lower.includes('mes')){state.mode='month';document.querySelectorAll('.foco-planner-tab').forEach(x=>x.classList.toggle('active',x.dataset.mode==='month'));refresh();result.textContent='Abri a visão mensal para você acompanhar toda a programação.';return}
      const response=await fetch('/api/admin/whatsapp/planner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command,items:items(),weekStart:dateOnly(range().start)})})
      const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.message||'Falha ao analisar')
      result.textContent=data.reply
      if(data.action==='duplicate'&&confirm(data.confirmation||'Aplicar esta ação?'))duplicateCurrentWeek()
    }catch(e){result.textContent='Não consegui executar: '+e.message}
  }
  const oldRender=window.render;window.render=function(){oldRender?.();setTimeout(()=>{applyFilters();renderMonth()},20)}
  setTimeout(init,120)
})()