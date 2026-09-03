import { driveFile, driveUploadSession } from '../../_lib/google-drive.js'

const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})
const types=new Set(['video/mp4','video/quicktime','video/webm','audio/mpeg','audio/mp4','audio/wav','audio/x-m4a'])
const MAX_FILE_SIZE=1024*1024*1024
const safe=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._ -]/g,'').replace(/\s+/g,' ').trim().slice(0,80)||'material'

async function submission(request,env){
 const u=new URL(request.url),id=u.searchParams.get('id')||'',token=u.searchParams.get('token')||'',raw=await env.FOCO_LINKS.get(`divisoes:submission:${id}`)
 if(!raw)return{error:json({message:'Envio expirado. Recomece o formulário.'},404)}
 const record=JSON.parse(raw)
 if(record.uploadToken!==token||record.status!=='pending_upload'||record.materialType!=='file')return{error:json({message:'Autorização inválida.'},403)}
 return{id,record}
}

export async function onRequestPost({request,env}){
 if(!env.FOCO_LINKS)return json({message:'Base indisponível.'},503)
 const found=await submission(request,env);if(found.error)return found.error
 const {id,record}=found
 if(!types.has(record.fileType)||record.fileSize<1||record.fileSize>MAX_FILE_SIZE)return json({message:'Formato inválido ou arquivo maior que 1 GB.'},422)
 try{
  const extension=(record.fileName.split('.').pop()||'arquivo').toLowerCase(),name=`${new Date().toISOString().slice(0,10)} - ${safe(record.name)} - ${safe(record.song)} - ${id}.${safe(extension)}`
  const session=await driveUploadSession(env,{type:record.fileType,length:record.fileSize,name})
  await env.FOCO_LINKS.put(`divisoes:submission:${id}`,JSON.stringify({...record,driveTargetName:name,driveTargetFolder:session.folder,uploadSessionCreatedAt:new Date().toISOString()}),{expirationTtl:86400})
  return json({ok:true,uploadUrl:session.uploadUrl},201)
 }catch(error){console.error(error);return json({message:'Não foi possível preparar o Google Drive. Tente novamente.'},500)}
}

export async function onRequestPatch({request,env}){
 if(!env.FOCO_LINKS)return json({message:'Base indisponível.'},503)
 const found=await submission(request,env);if(found.error)return found.error
 const {id,record}=found;let body
 try{body=await request.json()}catch{return json({message:'Confirmação inválida.'},400)}
 const fileId=String(body.fileId||'').trim()
 if(!fileId)return json({message:'O Drive não confirmou o arquivo.'},422)
 try{
  const file=await driveFile(env,fileId),validName=file.name===record.driveTargetName,validSize=Number(file.size)===Number(record.fileSize),validType=file.mimeType===record.fileType,validFolder=(file.parents||[]).includes(record.driveTargetFolder)
  if(!validName||!validSize||!validType||!validFolder)return json({message:'O arquivo recebido não corresponde ao envio iniciado.'},422)
  const saved={...record,status:'received',driveFileId:file.id,driveWebViewLink:file.webViewLink||'',updatedAt:new Date().toISOString()}
  delete saved.uploadToken;delete saved.driveTargetName;delete saved.driveTargetFolder;delete saved.uploadSessionCreatedAt
  await env.FOCO_LINKS.put(`divisoes:submission:${id}`,JSON.stringify(saved))
  return json({ok:true,id},201)
 }catch(error){console.error(error);return json({message:'Não foi possível confirmar o arquivo no Google Drive.'},500)}
}
