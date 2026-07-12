(()=>{
  if(!location.pathname.startsWith('/admin/whatsapp'))return

  const today=()=>{
    const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)
  }
  const currentTime=()=>new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false})
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`

  function createManualDispatch(){
    const id=uid()
    const item={
      id,
      date:today(),
      time:currentTime(),
      title:'Disparo manual',
      message:'',
      status:'PENDENTE',
      sentAt:null,
      error:null,
      source:'manual',
      createdAt:new Date().toISOString()
    }
    const all=window.load?.()||[]
    window.save?.([...all,item])
    window.showNotice?.('Disparo manual criado. Preencha a mensagem e salve.')
    setTimeout(()=>window.editMessage?.(id),120)
  }

  function install(){
    if(document.querySelector('#newManualDispatch'))return

    const toolbarActions=document.querySelector('.toolbar .actions')
    if(toolbarActions){
      const button=document.createElement('button')
      button.id='newManualDispatch'
      button.className='btn primary'
      button.type='button'
      button.innerHTML='＋ Novo disparo'
      button.onclick=createManualDispatch
      toolbarActions.prepend(button)
    }

    const plannerButton=document.querySelector('#newSchedule')
    if(plannerButton){
      plannerButton.textContent='＋ Novo disparo'
      plannerButton.onclick=createManualDispatch
    }
  }

  window.createManualDispatch=createManualDispatch
  setTimeout(install,180)
  setTimeout(install,700)
})()
