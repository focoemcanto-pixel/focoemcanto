(()=>{
  if(location.pathname!=='/admin/whatsapp/') return

  const GROUP_IDS=['120363404674461725@g.us','120363428159310476@g.us']
  let selectedId=null
  const oldEdit=window.editMessage
  const oldRender=window.render

  function ensureField(){
    const textarea=document.getElementById('editMessage')
    if(!textarea||document.getElementById('editImageUrl')) return
    const spacer=document.createElement('div');spacer.style.height='10px'
    const wrap=document.createElement('div')
    wrap.innerHTML=`<label class="field"><span>Imagem do disparo (opcional)</span><input id="editImageUrl" class="input" type="url" placeholder="https://.../imagem.jpg"><small class="muted">Use uma URL pública direta da imagem. O texto será enviado como legenda.</small></label><div id="editImagePreview" style="display:none;margin-top:10px"><img alt="Prévia da imagem" style="width:100%;max-height:260px;object-fit:contain;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:#090a10"></div>`
    textarea.after(spacer,wrap)
    const input=document.getElementById('editImageUrl')
    input.addEventListener('input',updatePreview)
  }

  function updatePreview(){
    const input=document.getElementById('editImageUrl'),box=document.getElementById('editImagePreview')
    if(!input||!box)return
    const url=input.value.trim(),img=box.querySelector('img')
    if(url){img.src=url;box.style.display='block'}else{img.removeAttribute('src');box.style.display='none'}
  }

  window.editMessage=function(id){
    selectedId=id
    oldEdit?.(id)
    ensureField()
    const item=window.load?.().find(x=>x.id===id)
    document.getElementById('editImageUrl').value=item?.imageUrl||''
    updatePreview()
  }

  function decorateCards(){
    const items=window.load?.()||[]
    document.querySelectorAll('.message').forEach(card=>{
      card.querySelector('.foco-message-media')?.remove()
      const heading=card.querySelector('.day')?.textContent||''
      const item=items.find(x=>heading.includes(x.title)&&card.querySelector('.time')?.textContent.includes(x.date))
      if(!item?.imageUrl)return
      const media=document.createElement('div');media.className='foco-message-media';media.style.cssText='margin:0 0 14px;padding:10px;border-radius:16px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09)'
      media.innerHTML=`<img src="${escapeHtml(item.imageUrl)}" alt="Imagem do disparo" style="display:block;width:100%;max-height:320px;object-fit:contain;border-radius:12px;background:#090a10"><div class="muted" style="margin-top:8px;font-size:12px">🖼️ Imagem anexada ao disparo</div>`
      card.querySelector('.text')?.before(media)
    })
  }

  window.render=function(){oldRender?.();setTimeout(decorateCards,0)}

  const saveButton=document.getElementById('saveEdit')
  if(saveButton){
    const oldSave=saveButton.onclick
    saveButton.onclick=function(event){
      const id=selectedId,url=document.getElementById('editImageUrl')?.value.trim()||''
      oldSave?.call(this,event)
      if(!id)return
      const items=window.load?.()||[],item=items.find(x=>x.id===id)
      if(item){item.imageUrl=url;window.save?.(items)}
      selectedId=null
    }
  }

  window.sendNow=async function(id){
    const items=window.load?.()||[],item=items.find(x=>x.id===id)
    if(!item)return
    if(!confirm(`Enviar agora para os dois grupos LIVE${item.imageUrl?' com a imagem anexada':''}?`))return
    try{
      window.showNotice?.('Enviando...')
      const response=await fetch('/api/admin/whatsapp/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({groups:GROUP_IDS,text:item.message,imageUrl:item.imageUrl||''})})
      const data=await response.json().catch(()=>({}))
      if(!response.ok||!data.ok)throw new Error(data.message||'Falha no envio')
      item.status='ENVIADO';item.sentAt=new Date().toLocaleString('pt-BR');item.error=null
      window.save?.(items);window.showNotice?.(item.imageUrl?'Imagem e legenda enviadas para os dois grupos.':'Mensagem enviada para os dois grupos.')
    }catch(error){
      item.status='ERRO';item.error=error.message;window.save?.(items);window.showNotice?.('Não foi possível enviar: '+error.message,false)
    }
  }

  ensureField();setTimeout(decorateCards,0)

  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
})()