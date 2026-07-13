(()=>{
  const path=location.pathname
  const items=[
    ['/admin/','◈','Visão geral'],
    ['/admin/assistant/','✦','Assistente IA'],
    ['/admin/whatsapp/','◉','Lives & WhatsApp'],
    ['/admin/links/','↗','Links inteligentes'],
    ['/admin/funis/','▥','Análise de funis'],
    ['/admin/leads/','◎','CRM de leads'],
    ['/admin/products/','◇','Produtos & alunos'],
  ]

  const sidebar=document.createElement('aside')
  sidebar.className='foco-sidebar'
  sidebar.innerHTML=`<div class="foco-logo"><div class="foco-logo-mark">F</div><div>FOCO <b>OS</b></div></div><div class="foco-nav-label">Operação</div><nav class="foco-nav">${items.map(([href,icon,label])=>`<a href="${href}" class="${path===href?'active':''}"><span class="foco-nav-icon">${icon}</span><span>${label}</span></a>`).join('')}</nav><div class="foco-sidebar-footer"><div class="foco-status"><span class="foco-status-dot"></span><span>Sistema conectado</span></div><button id="focoLogout" class="btn secondary" style="width:100%;margin-top:8px">Sair do Foco OS</button></div>`

  const content=document.createElement('div')
  content.className='foco-content'
  while(document.body.firstChild)content.appendChild(document.body.firstChild)
  document.body.append(sidebar,content)

  const mobile=document.createElement('div')
  mobile.className='foco-mobile-top'
  mobile.innerHTML='<button class="foco-menu-btn" aria-label="Abrir menu">☰</button><strong>FOCO <span style="color:#9b5cff">OS</span></strong><span></span>'
  content.prepend(mobile)
  mobile.querySelector('button').onclick=()=>sidebar.classList.toggle('open')
  sidebar.addEventListener('click',event=>{if(event.target.closest('a')&&innerWidth<981)sidebar.classList.remove('open')})
  document.getElementById('focoLogout').onclick=async()=>{try{await fetch('/api/admin/session',{method:'DELETE'})}finally{location.href='/admin/login/'}}

  if(path==='/admin/'){
    const cards=[...document.querySelectorAll('.module')]
    const ai=cards.find(el=>el.textContent.includes('Assistente IA'))
    if(ai&&ai.tagName!=='A'){
      const link=document.createElement('a')
      link.className=ai.className
      link.href='/admin/assistant/'
      link.innerHTML=ai.innerHTML
      ai.replaceWith(link)
      const footer=link.querySelector('.footer')
      if(footer)footer.innerHTML='<span>Acessar</span><span class="badge">ATIVO</span>'
    }
    const aside=[...document.querySelectorAll('.card')].find(el=>el.textContent.includes('Assistente operacional'))
    if(aside){
      aside.style.cursor='pointer'
      aside.onclick=()=>location.href='/admin/assistant/'
      const p=aside.querySelector('.muted')
      if(p)p.textContent='Transforme comandos em campanhas completas, mensagens, calendário e links prontos para revisão.'
    }
  }

  if(path==='/admin/assistant/'){
    const grid=document.querySelector('.hero .grid')
    if(grid&&!document.getElementById('destination')){
      const input=document.createElement('input')
      input.id='destination'
      input.placeholder='URL de destino da campanha (opcional)'
      input.style.gridColumn='1 / -1'
      grid.appendChild(input)
    }

    window.generate=async()=>{
      const body={action:'generate',prompt:document.getElementById('prompt').value,title:document.getElementById('title').value,product:document.getElementById('product').value,theme:document.getElementById('theme').value,audience:document.getElementById('audience').value,goal:document.getElementById('goal').value,startDate:document.getElementById('startDate').value,destination:document.getElementById('destination')?.value||''}
      if(!body.prompt&&!body.product)return window.notify?.('Descreva a campanha ou informe o produto.')
      const button=document.querySelector('[onclick="generate()"]')
      if(button){button.disabled=true;button.textContent='✦ Criando com IA...'}
      try{
        const response=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
        const data=await response.json()
        if(!response.ok)return window.notify?.(data.message)
        window.notify?.(data.warning?'Campanha criada com fallback: '+data.warning:'Campanha criada com IA!')
        ;['prompt','title','product','theme','audience','destination'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''})
        await window.load?.()
      }finally{
        if(button){button.disabled=false;button.textContent='✦ Gerar campanha'}
      }
    }

    window.approve=async id=>{
      const campaign=window.campaigns?.find?.(x=>x.id===id)
      if(!campaign)return
      const destination=campaign.destination||prompt('Informe a URL de destino para criar os links rastreáveis. Você pode cancelar para preparar apenas o funil, tarefas e agenda WhatsApp.','')||''
      if(destination&&!campaign.destination){
        await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...campaign,destination})})
      }
      window.notify?.('Preparando operação e agenda WhatsApp...')
      const response=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'activate',id})})
      const data=await response.json()
      if(!response.ok)return window.notify?.(data.message||'Não foi possível preparar a operação.')
      const links=data.campaign?.activation?.links?.length||0
      const messages=data.campaign?.activation?.scheduledMessages||0
      window.notify?.(`Operação preparada: funil, tarefas, ${messages} mensagens na agenda${links?` e ${links} links rastreáveis`:''}.`)
      await window.load?.()
    }
  }

  if(path==='/admin/whatsapp/'){
    const STORAGE_KEY='foco_os_whatsapp_schedule_v1'
    let cloudReady=false
    const sortItems=list=>[...(list||[])].sort((a,b)=>`${a.date||''}${a.time||''}`.localeCompare(`${b.date||''}${b.time||''}`))
    const writeLocal=list=>{localStorage.setItem(STORAGE_KEY,JSON.stringify(sortItems(list)));window.render?.()}

    const fetchCloud=async()=>{
      const response=await fetch('/api/whatsapp/schedule',{cache:'no-store'})
      if(response.status===401){location.href='/admin/login/?next=/admin/whatsapp/';return []}
      const data=await response.json().catch(()=>({}))
      if(!response.ok||!data.ok)throw new Error(data.message||'Falha ao carregar agenda.')
      return sortItems(data.items||[])
    }

    const syncToCloud=async list=>{
      if(!cloudReady)return list
      const response=await fetch('/api/whatsapp/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:list})})
      const data=await response.json().catch(()=>({}))
      if(!response.ok||!data.ok)throw new Error(data.message||'Falha ao salvar agenda na nuvem.')
      const saved=sortItems(data.items||list)
      writeLocal(saved)
      return saved
    }

    window.refreshWhatsappSchedule=async()=>{
      const list=await fetchCloud()
      writeLocal(list)
      return list
    }

    const startSync=async()=>{
      try{
        const list=await fetchCloud()
        writeLocal(list)
        cloudReady=true
        const originalSave=window.save
        if(typeof originalSave==='function'){
          window.save=function(nextItems){
            originalSave(nextItems)
            return syncToCloud(nextItems).catch(async error=>{
              console.warn('Falha ao sincronizar agenda:',error)
              window.showNotice?.('Não foi possível salvar na nuvem: '+error.message,false)
              try{await window.refreshWhatsappSchedule()}catch{}
              throw error
            })
          }
        }
        window.showNotice?.('Agenda carregada da nuvem. O KV é a fonte oficial dos disparos.')
      }catch(error){
        console.warn(error)
        window.showNotice?.('Não foi possível carregar a agenda da nuvem: '+error.message,false)
      }
    }
    startSync()
  }
})()