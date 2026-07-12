(()=>{
  if(!location.pathname.startsWith('/admin/whatsapp')) return

  const DEFAULT_POLL={
    question:'Qual desses temas você mais gostaria de ver na próxima Quarta Vocal?',
    options:['Afinação','Extensão vocal','Segunda voz','Respiração','Segurança para cantar'],
    multiSelect:false,
  }
  let editingPollId=null

  const previousSave=window.save
  const previousRender=window.render
  const previousEdit=window.editMessage
  const previousSendNow=window.sendNow

  function isPollItem(item){
    return Boolean(item?.poll)||/enquete/i.test(String(item?.title||''))
  }

  function normalizeItem(item){
    if(!isPollItem(item)) return item
    const existing=item.poll&&typeof item.poll==='object'?item.poll:DEFAULT_POLL
    const options=Array.isArray(existing.options)?existing.options.map(String).map(v=>v.trim()).filter(Boolean).slice(0,12):DEFAULT_POLL.options
    item.type='POLL'
    item.poll={
      question:String(existing.question||DEFAULT_POLL.question).trim(),
      options:options.length>=2?options:[...DEFAULT_POLL.options],
      multiSelect:Boolean(existing.multiSelect),
    }
    return item
  }

  window.save=function(items){
    const normalized=(Array.isArray(items)?items:[]).map(normalizeItem)
    return previousSave?.(normalized)
  }

  function migrate(){
    const items=window.load?.()||[]
    let changed=false
    items.forEach(item=>{
      if(isPollItem(item)&&!item.poll){normalizeItem(item);changed=true}
    })
    if(changed) previousSave?.(items)
  }

  function ensurePollEditor(){
    if(document.getElementById('focoPollEditor')) return
    const message=document.getElementById('editMessage')
    if(!message) return
    const editor=document.createElement('div')
    editor.id='focoPollEditor'
    editor.style.cssText='display:none;margin-top:12px;padding:16px;border:1px solid rgba(168,85,247,.28);border-radius:18px;background:rgba(168,85,247,.07)'
    editor.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">
        <div><strong>📊 Enquete nativa do WhatsApp</strong><div class="muted" style="font-size:12px;margin-top:3px">Os participantes votarão diretamente dentro do grupo.</div></div>
        <span class="badge live">ENQUETE</span>
      </div>
      <label class="field"><span>Pergunta</span><input id="editPollQuestion" class="input" maxlength="255"></label>
      <label class="field"><span>Opções — uma por linha</span><textarea id="editPollOptions" class="textarea" style="min-height:150px" placeholder="Afinação\nExtensão vocal\nSegunda voz"></textarea><small class="muted">Use de 2 a 12 opções.</small></label>
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer"><input id="editPollMulti" type="checkbox"><span>Permitir mais de uma resposta</span></label>`
    message.after(editor)
  }

  function fillPollEditor(item){
    ensurePollEditor()
    const editor=document.getElementById('focoPollEditor')
    const isPoll=isPollItem(item)
    editor.style.display=isPoll?'block':'none'
    messageVisibility(!isPoll)
    if(!isPoll) return
    normalizeItem(item)
    document.getElementById('editPollQuestion').value=item.poll.question
    document.getElementById('editPollOptions').value=item.poll.options.join('\n')
    document.getElementById('editPollMulti').checked=Boolean(item.poll.multiSelect)
  }

  function messageVisibility(visible){
    const message=document.getElementById('editMessage')
    if(!message)return
    message.style.display=visible?'block':'none'
    const label=message.previousElementSibling
    if(label&&label.tagName==='DIV'&&label.style.height){}
  }

  window.editMessage=function(id){
    editingPollId=id
    previousEdit?.(id)
    const item=window.load?.().find(x=>x.id===id)
    if(item) fillPollEditor(item)
  }

  function pollPreview(item){
    const options=item.poll.options.map((option,index)=>`<div style="display:flex;gap:10px;align-items:center;padding:10px 12px;margin-top:8px;border-radius:12px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08)"><span style="width:22px;height:22px;border:2px solid rgba(255,255,255,.42);border-radius:50%;display:inline-block;flex:none"></span><span>${escapeHtml(option)}</span></div>`).join('')
    return `<div class="foco-poll-preview" style="margin:0 0 14px;padding:16px;border-radius:18px;background:linear-gradient(145deg,rgba(168,85,247,.12),rgba(255,255,255,.025));border:1px solid rgba(168,85,247,.28)"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px"><strong>📊 ${escapeHtml(item.poll.question)}</strong><span class="badge live">NATIVA</span></div>${options}<div class="muted" style="font-size:12px;margin-top:10px">${item.poll.multiSelect?'Múltiplas respostas permitidas':'Apenas uma resposta por pessoa'}</div></div>`
  }

  function decoratePollCards(){
    const items=window.load?.()||[]
    document.querySelectorAll('.message').forEach(card=>{
      card.querySelector('.foco-poll-preview')?.remove()
      const title=card.querySelector('.day')?.textContent||''
      const item=items.find(x=>title.includes(x.title))
      if(!item||!isPollItem(item))return
      normalizeItem(item)
      const text=card.querySelector('.text')
      if(text){text.style.display='none';text.insertAdjacentHTML('beforebegin',pollPreview(item))}
    })
  }

  window.render=function(){
    previousRender?.()
    setTimeout(decoratePollCards,0)
  }

  document.getElementById('saveEdit')?.addEventListener('click',()=>{
    if(!editingPollId)return
    const item=(window.load?.()||[]).find(x=>x.id===editingPollId)
    if(!item||!isPollItem(item)){editingPollId=null;return}
    const question=document.getElementById('editPollQuestion')?.value.trim()||''
    const options=(document.getElementById('editPollOptions')?.value||'').split('\n').map(v=>v.trim()).filter(Boolean).slice(0,12)
    if(!question||options.length<2){
      window.showNotice?.('A enquete precisa de uma pergunta e pelo menos 2 opções.',false)
      return
    }
    setTimeout(()=>{
      const items=window.load?.()||[]
      const saved=items.find(x=>x.id===editingPollId)
      if(saved){
        saved.type='POLL'
        saved.poll={question,options,multiSelect:Boolean(document.getElementById('editPollMulti')?.checked)}
        saved.message=''
        window.save?.(items)
      }
      editingPollId=null
    },0)
  },true)

  async function sendPoll(groups,item,isTest=false){
    const response=await fetch('/api/admin/whatsapp/send',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({groups,poll:item.poll,test:isTest}),
    })
    const data=await response.json().catch(()=>({}))
    if(!response.ok||!data.ok)throw new Error(data.message||'Falha no envio da enquete')
    return data
  }

  window.sendNow=async function(id){
    const items=window.load?.()||[]
    const item=items.find(x=>x.id===id)
    if(!item||!isPollItem(item))return previousSendNow?.(id)
    normalizeItem(item)
    if(!confirm('Enviar esta enquete nativa agora para os dois grupos LIVE?'))return
    try{
      window.showNotice?.('Enviando enquete para os grupos...')
      await sendPoll(['120363404674461725@g.us','120363428159310476@g.us'],item)
      item.status='ENVIADO';item.sentAt=new Date().toLocaleString('pt-BR');item.error=null
      window.save?.(items)
      window.showNotice?.('Enquete nativa enviada para os dois grupos.')
    }catch(error){
      item.status='ERRO';item.error=error.message;window.save?.(items)
      window.showNotice?.('Não foi possível enviar a enquete: '+error.message,false)
    }
  }

  document.getElementById('sendWhatsappTest')?.addEventListener('click',async event=>{
    if(!editingPollId)return
    const item=(window.load?.()||[]).find(x=>x.id===editingPollId)
    if(!item||!isPollItem(item))return
    event.preventDefault();event.stopImmediatePropagation()
    normalizeItem(item)
    const question=document.getElementById('editPollQuestion')?.value.trim()||''
    const options=(document.getElementById('editPollOptions')?.value||'').split('\n').map(v=>v.trim()).filter(Boolean).slice(0,12)
    if(!question||options.length<2)return window.showNotice?.('Preencha a pergunta e pelo menos 2 opções.',false)
    item.poll={question,options,multiSelect:Boolean(document.getElementById('editPollMulti')?.checked)}
    const number=(document.getElementById('whatsappTestNumber')?.value||'').replace(/\D/g,'')
    if(number.length<10)return window.showNotice?.('Informe um número de teste válido.',false)
    const button=document.getElementById('sendWhatsappTest'),original=button.textContent
    button.disabled=true;button.textContent='Enviando enquete...'
    try{await sendPoll([number],item,true);window.showNotice?.('Enquete de teste enviada com sucesso.')}
    catch(error){window.showNotice?.('Falha no teste da enquete: '+error.message,false)}
    finally{button.disabled=false;button.textContent=original}
  },true)

  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}

  ensurePollEditor()
  migrate()
  setTimeout(decoratePollCards,0)
})()