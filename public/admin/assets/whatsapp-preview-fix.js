(()=>{
  if(location.pathname!=='/admin/whatsapp/'&&location.pathname!=='/admin/whatsapp')return

  let stablePreview=''

  const previewBox=()=>document.getElementById('editImagePreview')
  const previewImg=()=>previewBox()?.querySelector('img')

  function forcePreview(){
    const box=previewBox(),img=previewImg()
    if(!box||!img||!stablePreview)return
    if(img.src!==stablePreview)img.src=stablePreview
    if(box.style.display==='none')box.style.display='block'
  }

  function clearStable(){stablePreview=''}

  function bind(){
    const input=document.getElementById('editImageFile')
    const remove=document.getElementById('removeUploadedImage')
    const box=previewBox()
    const img=previewImg()
    if(!input||!box||!img)return false

    input.addEventListener('change',event=>{
      const file=event.target.files?.[0]
      if(!file)return
      const reader=new FileReader()
      reader.onload=()=>{
        stablePreview=String(reader.result||'')
        forcePreview()
      }
      reader.readAsDataURL(file)
    })

    remove?.addEventListener('click',clearStable)

    const observer=new MutationObserver(()=>forcePreview())
    observer.observe(box,{attributes:true,subtree:true,attributeFilter:['src','style']})

    const oldEdit=window.editMessage
    if(typeof oldEdit==='function'){
      window.editMessage=function(id){
        clearStable()
        return oldEdit.call(this,id)
      }
    }

    document.getElementById('cancelEdit')?.addEventListener('click',clearStable)
    document.getElementById('saveEdit')?.addEventListener('click',()=>setTimeout(clearStable,0))
    return true
  }

  if(!bind()){
    const timer=setInterval(()=>{if(bind())clearInterval(timer)},100)
    setTimeout(()=>clearInterval(timer),5000)
  }
})()
