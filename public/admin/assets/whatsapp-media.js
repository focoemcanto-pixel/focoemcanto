(()=>{
  if(location.pathname!=='/admin/whatsapp/') return

  const GROUP_IDS=['120363404674461725@g.us','120363428159310476@g.us']
  const DEFAULT_TEST_NUMBER='5571993392294'
  let selectedId=null
  const oldEdit=window.editMessage
  const oldRender=window.render

  function ensureField(){
    const textarea=document.getElementById('editMessage')
    if(!textarea||document.getElementById('editImageFile')) return

    const spacer=document.createElement('div')
    spacer.style.height='12px'

    const wrap=document.createElement('div')
    wrap.innerHTML=`
      <div class="field">
        <span>Imagem do disparo (opcional)</span>
        <label id="focoUploadZone" for="editImageFile" style="display:grid;place-items:center;gap:8px;min-height:128px;padding:18px;border-radius:16px;border:1px dashed rgba(168,85,247,.55);background:linear-gradient(145deg,rgba(168,85,247,.10),rgba(255,255,255,.025));cursor:pointer;text-align:center;transition:.2s ease">
          <div style="font-size:28px">🖼️</div>
          <strong>Clique para selecionar uma imagem</strong>
          <small class="muted">JPG, PNG, WEBP ou GIF · até 10 MB</small>
        </label>
        <input id="editImageFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none">
      </div>
      <input id="editImageUrl" type="hidden">
      <div id="editImagePreview" style="display:none;margin-top:12px;padding:12px;border-radius:18px;background:#090a10;border:1px solid rgba(255,255,255,.10)">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px">
          <div><strong>Prévia da mídia</strong><div id="editUploadStatus" class="muted" style="font-size:12px;margin-top:3px"></div></div>
          <button id="removeUploadedImage" type="button" class="ghost danger">Remover</button>
        </div>
        <img alt="Prévia da imagem" style="display:block;width:100%;max-height:340px;object-fit:contain;border-radius:14px;background:#05060a">
      </div>
      <div style="height:14px"></div>
      <div class="field" style="padding:14px;border-radius:16px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08)">
        <span>Número para teste</span>
        <input id="whatsappTestNumber" class="input" inputmode="numeric" value="${DEFAULT_TEST_NUMBER}" placeholder="5571993392294">
        <small class="muted">O teste será enviado somente para este número, sem disparar nos grupos.</small>
      </div>
      <div class="actions" style="margin-top:12px">
        <button id="sendWhatsappTest" type="button" class="btn secondary" style="flex:1">🧪 Enviar teste</button>
      </div>`

    textarea.after(spacer,wrap)

    const zone=document.getElementById('focoUploadZone')
    const input=document.getElementById('editImageFile')
    input.addEventListener('change',uploadSelectedImage)
    zone.addEventListener('dragover',event=>{event.preventDefault();zone.style.borderColor='#a855f7';zone.style.transform='translateY(-1px)'})
    zone.addEventListener('dragleave',()=>{zone.style.borderColor='rgba(168,85,247,.55)';zone.style.transform=''})
    zone.addEventListener('drop',event=>{
      event.preventDefault();zone.style.borderColor='rgba(168,85,247,.55)';zone.style.transform=''
      const file=event.dataTransfer?.files?.[0]
      if(file){const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;uploadSelectedImage({target:input})}
    })

    document.getElementById('removeUploadedImage').addEventListener('click',()=>{
      document.getElementById('editImageUrl').value=''
      input.value=''
      document.getElementById('editUploadStatus').textContent=''
      updatePreview()
    })

    document.getElementById('sendWhatsappTest').addEventListener('click',sendTest)
  }

  async function uploadSelectedImage(event){
    const file=event.target.files?.[0]
    if(!file)return
    const status=document.getElementById('editUploadStatus')
    const input=document.getElementById('editImageFile')
    if(file.size>10*1024*1024){window.showNotice?.('A imagem deve ter no máximo 10 MB.',false);input.value='';return}
    if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)){window.showNotice?.('Formato de imagem não permitido.',false);input.value='';return}

    const localUrl=URL.createObjectURL(file)
    document.getElementById('editImagePreview').style.display='block'
    document.querySelector('#editImagePreview img').src=localUrl
    status.textContent='Preparando upload...'

    const form=new FormData();form.append('file',file)
    input.disabled=true
    try{
      status.textContent='Enviando imagem para o Foco OS...'
      const response=await fetch('/api/admin/media/upload',{method:'POST',body:form})
      const data=await response.json().catch(()=>({}))
      if(!response.ok||!data.ok)throw new Error(data.message||'Falha no upload')
      document.getElementById('editImageUrl').value=data.url
      updatePreview()
      status.textContent='Upload concluído · link público criado automaticamente.'
      window.showNotice?.('Imagem enviada com sucesso.')
    }catch(error){
      input.value='';document.getElementById('editImageUrl').value='';status.textContent='';updatePreview()
      window.showNotice?.('Não foi possível enviar a imagem: '+error.message,false)
    }finally{input.disabled=false;URL.revokeObjectURL(localUrl)}
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
    document.getElementById('editImageFile').value=''
    document.getElementById('editUploadStatus').textContent=item?.imageUrl?'Imagem já armazenada no Foco OS.':''
    document.getElementById('whatsappTestNumber').value=localStorage.getItem('foco_whatsapp_test_number')||DEFAULT_TEST_NUMBER
    updatePreview()
  }

  async function sendTest(){
    const number=(document.getElementById('whatsappTestNumber')?.value||'').replace(/\D/g,'')
    const text=document.getElementById('editMessage')?.value.trim()||''
    const imageUrl=document.getElementById('editImageUrl')?.value.trim()||''
    if(number.length<10)return window.showNotice?.('Informe um número de teste válido com DDI e DDD.',false)
    if(!text&&!imageUrl)return window.showNotice?.('Digite uma mensagem ou carregue uma imagem antes do teste.',false)

    localStorage.setItem('foco_whatsapp_test_number',number)
    const button=document.getElementById('sendWhatsappTest')
    const original=button.textContent
    button.disabled=true;button.textContent='Enviando teste...'
    try{
      const response=await fetch('/api/admin/whatsapp/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({groups:[number],text,imageUrl,test:true})})
      const data=await response.json().catch(()=>({}))
      if(!response.ok||!data.ok)throw new Error(data.message||'Falha no envio de teste')
      window.showNotice?.(`Teste enviado com sucesso para ${formatPhone(number)}.`)
    }catch(error){window.showNotice?.('Não foi possível enviar o teste: '+error.message,false)}
    finally{button.disabled=false;button.textContent=original}
  }

  function decorateCards(){
    const items=window.load?.()||[]
    document.querySelectorAll('.message').forEach(card=>{
      card.querySelector('.foco-message-media')?.remove()
      const heading=card.querySelector('.day')?.textContent||''
      const item=items.find(x=>heading.includes(x.title)&&card.querySelector('.time')?.textContent.includes(x.date))
      if(!item?.imageUrl)return
      const media=document.createElement('div');media.className='foco-message-media';media.style.cssText='margin:0 0 14px;padding:10px;border-radius:16px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09)'
      media.innerHTML=`<img src="${escapeHtml(item.imageUrl)}" alt="Imagem do disparo" style="display:block;width:100%;max-height:320px;object-fit:contain;border-radius:12px;background:#090a10"><div class="muted" style="margin-top:8px;font-size:12px">🖼️ Imagem armazenada e anexada ao disparo</div>`
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
      window.showNotice?.('Enviando para os grupos...')
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

  function formatPhone(value){const n=String(value);if(n.startsWith('55')&&n.length>=12)return `+55 ${n.slice(2,4)} ${n.slice(4,9)}-${n.slice(9)}`;return '+'+n}
  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
})()