import { isAdminAuthenticated } from '../../../_lib/admin-auth.js'

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})
const allowed=new Set(['image/jpeg','image/png','image/webp','image/gif'])

export async function onRequestPost({request,env}){
  if(!(await isAdminAuthenticated(request,env)))return json({ok:false,message:'Não autorizado.'},401)
  if(!env.FOCO_MEDIA)return json({ok:false,message:'Binding R2 FOCO_MEDIA não configurado.'},500)
  try{
    const form=await request.formData()
    const file=form.get('file')
    if(!(file instanceof File))return json({ok:false,message:'Selecione uma imagem.'},400)
    if(!allowed.has(file.type))return json({ok:false,message:'Formato não permitido. Use JPG, PNG, WEBP ou GIF.'},400)
    if(file.size>10*1024*1024)return json({ok:false,message:'A imagem deve ter no máximo 10 MB.'},400)
    const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"}[file.type]
    const key=`${crypto.randomUUID()}.${ext}`
    await env.FOCO_MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:'public, max-age=31536000, immutable'},customMetadata:{originalName:file.name||'',uploadedAt:new Date().toISOString()}})
    const origin=new URL(request.url).origin
    return json({ok:true,key,url:`${origin}/media/whatsapp/${key}`,name:file.name,size:file.size,type:file.type})
  }catch(error){return json({ok:false,message:error?.message||'Falha no upload.'},500)}
}
