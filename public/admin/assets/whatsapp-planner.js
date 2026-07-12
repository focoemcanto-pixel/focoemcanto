(()=>{
  if(!location.pathname.startsWith('/admin/whatsapp'))return
  const SETTINGS_KEY='foco_whatsapp_week_settings_v1'
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
  function loadSettings(){try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}catch{return{}}}
  function saveSettings(data){localStorage.setItem(SETTINGS_KEY,JSON.stringify(data))}
  function range(){const start=monday(state.cursor);return{start,end:add(start,6)}}
  function weekKey(){return dateOnly(range().start)}
  function weekItems(){const r=range();return items().filter(x=>{const d=new Date(x.date+'T12:00:00');return d>=r.start&&d<=r.end})}
  function init(){
    const stats=$('.stats');if(!stats||$('#focoPlanner'))return
    const el=document.createElement('section');el.id='focoPlanner';el.className='foco-planner';el.innerHTML=`
      <div class="foco-planner-top">
        <div class="foco-planner-card">
          <div class="foco-planner-row" style="justify-content:space-between"><div><h2 class="foco-planner-title">Central de programação</h2><p class="foco-planner-sub">Organize os disparos por semana ou acompanhe todo o mês.</p></div><div class="foco-planner-tabs"><button class="foco-planner-tab active" data-mode="week">Semana</button><button class="foco-planner-tab" data-mode="month">Mês</button></div></div>
          <div class="foco-planner-nav"><div class="foco-planner-row"><button class="foco-planner-btn" id="plannerPrev">←</button><button class="foco-planner-btn" id="plannerToday">Hoje</button><button class="foco-planner-btn" id="plannerNext">→</button></div><div class="foco-planner-range" id="plannerRange"></div><div class="foco-planner-row"><button class="foco-planner-btn" id="duplicateWeek">Duplicar semana</button><button class="foco-planner-btn primary" id="newSchedule">Nova programação</button></div></div>
          <div id="weekSettings" style="margin-top:16px;padding:16px;border:1px solid rgba(168,85,247,.26);border-radius:18px;background:linear-gradient(145deg,rgba(168,85,247,.10),rgba(255,255,255,.025))">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px"><div><strong style="font-size:15px">Configuração da semana</strong><div class="foco-planner-sub" style="margin-top:4px">Altere uma vez e atualize todos os disparos pendentes desta semana.</div></div><span style="font-size:11px;padding:6px 9px;border-radius:999px;background:rgba(168,85,247,.17);color:#d8b4fe">SINCRONIZADO</span></div>
            <div style="display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:10px" class="foco-week-fields">
              <label style="display:grid;gap:7px"><span style="font-size:12px;font-weight:800;color:rgba(255,255,255,.7)">Tema da semana</span><input id="weekTheme" class="input" placeholder="Ex.: Afinação e segurança vocal"></label>
              <label style="display:grid;gap:7px"><span style="font-size:12px;font-weight:800;color:rgba(255,255,255,.7)">Link da live</span><input id="weekLiveLink" class="input" placeholder="https://..."></label>
              <label style="display:grid;gap:7px"><span style="font-size:12px;font-weight:800;color:rgba(255,255,255,.7)">Link do replay</span><input id="weekReplayLink" class="input" placeholder="https://..."></label>
            </div>
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:12px;flex-wrap:wrap"><small class="foco-planner-sub">Tema e links são aplicados somente aos disparos ainda não enviados.</small><button class="foco-planner-btn primary" id="applyWeekSettings">Atualizar disparos da semana</button></div>
          </div>
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
    const responsive=document.createElement('style');responsive.textContent='@media(max-width:900px){.foco-week-fields{grid-template-columns:1fr!important}}';document.head.appendChild(responsive)
    bind();refresh()
  }
  function bind(){
    document.querySelectorAll('.foco-planner-tab').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;document.querySelectorAll('.foco-planner-tab').forEach(x=>x.classList.toggle('active',x===b));refresh()})
    $('#plannerPrev').onclick=()=>{state.cursor=add(state.cursor,state.mode==='week'?-7:-30);refresh()}
    $('#plannerNext').onclick=()=>{state.cursor=add(state.cursor,state.mode==='week'?7:30);refresh()}
    $('#plannerToday').onclick=()=>{state.cursor=new Date();refresh()}
    $('#newSchedule').onclick=()=>{$('.layout')?.scrollIntoView({behavior:'smooth',block:'start'})}
    $('#duplicateWeek').onclick=()=>duplicateCurrentWeek()
    $('#applyWeekSettings').onclick=applyWeekSettings
    document.querySelectorAll('.foco-planner-filter').forEach(b=>b.onclick=()=>{
      if(b.dataset.status){state.status=b.dataset.status;document.querySelectorAll('[data-status]').forEach(x=>x.classList.toggle('active',x===b))}
      if(b.dataset.type){state.type=state.type===b.dataset.type?'ALL':b.dataset.type;b.classList.toggle('active',state.type===b.dataset.type)}
      applyFilters();renderMonth()
    })
    document.querySelectorAll('.foco-ai-chip').forEach(b=>b.onclick=()=>{$('#plannerCommand').value=b.textContent;runCommand()})
    $('#runPlannerCommand').onclick=runCommand
  }
  function refresh(){
    document.body.classList.toggle('foco-month-mode',state.mode==='month');document.body.classList.toggle('foco-week-mode',state.mode==='week')
    const r=range();$('#plannerRange').textContent=state.mode==='week'?`${fmt(r.start)} — ${fmt(r.end)}`:monthFmt(state.cursor)
    $('#weekSettings').style.display=state.mode==='week'?'':'none'
    fillWeekSettings();applyFilters();renderMonth()
  }
  function fillWeekSettings(){
    const all=loadSettings(),saved=all[weekKey()]||{}
    const currentTheme=$('#theme')?.value.trim()||''
    const currentLive=$('#liveLink')?.value.trim()||''
    const currentReplay=$('#replayLink')?.value.trim()||''
    $('#weekTheme').value=saved.theme||currentTheme
    $('#weekLiveLink').value=saved.liveLink||currentLive
    $('#weekReplayLink').value=saved.replayLink||currentReplay
  }
  function replaceValue(text,oldValue,newValue,placeholders=[]){
    let out=String(text||'')
    placeholders.forEach(p=>{out=out.split(p).join(newValue||p)})
    if(oldValue&&newValue&&oldValue!==newValue)out=out.split(oldValue).join(newValue)
    return out
  }
  function applyWeekSettings(){
    const theme=$('#weekTheme').value.trim(),liveLink=$('#weekLiveLink').value.trim(),replayLink=$('#weekReplayLink').value.trim()
    if(!theme)return window.showNotice?.('Informe o tema da semana.',false)
    const configs=loadSettings(),key=weekKey(),old=configs[key]||{}
    const source=weekItems();if(!source.length)return window.showNotice?.('Não há disparos nesta semana para atualizar.',false)
    let changed=0
    const updated=items().map(item=>{
      if(!source.some(x=>x.id===item.id)||item.status==='ENVIADO')return item
      let message=item.message
      message=replaceValue(message,old.theme,theme,['[TEMA DA SEMANA]','{{tema}}'])
      if(liveLink)message=replaceValue(message,old.liveLink,liveLink,['[LINK DA LIVE]','{{link_live}}'])
      if(replayLink)message=replaceValue(message,old.replayLink,replayLink,['[LINK DO REPLAY]','{{link_replay}}'])
      changed++
      return {...item,message,weekTheme:theme,liveLink:liveLink||item.liveLink||'',replayLink:replayLink||item.replayLink||'',updatedAt:new Date().toISOString()}
    })
    configs[key]={theme,liveLink,replayLink,updatedAt:new Date().toISOString()};saveSettings(configs)
    if($('#theme'))$('#theme').value=theme;if($('#liveLink'))$('#liveLink').value=liveLink;if($('#replayLink'))$('#replayLink').value=replayLink
    persist(updated,`${changed} disparos pendentes foram atualizados com o tema e os links da semana.`)
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
    const r=range(),source=weekItems()
    if(!source.length)return window.showNotice?.('Não há disparos nesta semana.',false)
    if(!confirm(`Duplicar ${source.length} disparos para a próxima semana?`))return
    const all=items(),copies=source.map(x=>({...x,id:crypto.randomUUID(),date:dateOnly(add(new Date(x.date+'T12:00:00'),7)),title:x.title.replace(/ — cópia$/,''),status:'PENDENTE',sentAt:null,error:null,source:'duplicated',createdAt:new Date().toISOString()}))
    const configs=loadSettings(),current=configs[weekKey()]
    if(current){const nextKey=dateOnly(add(r.start,7));configs[nextKey]={...current,updatedAt:new Date().toISOString()};saveSettings(configs)}
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