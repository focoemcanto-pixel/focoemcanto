import { isAdminAuthenticated } from '../../../_lib/admin-auth.js'

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})
const allowed=new Set(['image/jpeg','image/png','image/webp','image/gif'])

export async function onRequestPost({request,env}){
  if(!(await isAdminAuthenticated(request,env)))return json({ok:false,message:'Não autorizado.'},401)
  if(!env.FOCO_MEDIA&&!env.FOCO_LINKS)return json({ok:false,message:'Nenhum armazenamento configurado. Conecte FOCO_MEDIA (R2) ou FOCO_LINKS (KV).'},500)
  try{
    const form=await request.formData()
    const file=form.get('file')
    if(!(file instanceof File))return json({ok:false,message:'Selecione uma imagem.'},400)
    if(!allowed.has(file.type))return json({ok:false,message:'Formato não permitido. Use JPG, PNG, WEBP ou GIF.'},400)
    if(file.size>10*1024*1024)return json({ok:false,message:'A imagem deve ter no máximo 10 MB.'},400)

    const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"}[file.type]
    const key=`${crypto.randomUUID()}.${ext}`
    const bytes=await file.arrayBuffer()

    if(env.FOCO_MEDIA){
      await env.FOCO_MEDIA.put(key,bytes,{httpMetadata:{contentType:file.type,cacheControl:'public, max-age=31536000, immutable'},customMetadata:{originalName:file.name||'',uploadedAt:new Date().toISOString()}})
    }else{
      await env.FOCO_LINKS.put(`media:${key}`,bytes,{metadata:{contentType:file.type,originalName:file.name||'',uploadedAt:new Date().toISOString()},expirationTtl:60*60*24*90})
    }

    const origin=new URL(request.url).origin
    return json({ok:true,key,url:`${origin}/media/whatsapp/${key}`,name:file.name,size:file.size,type:file.type,storage:env.FOCO_MEDIA?'r2':'kv'})
  }catch(error){
    console.error('media upload failed',error)
    return json({ok:false,message:error?.message||'Falha no upload.'},500)
  }
}