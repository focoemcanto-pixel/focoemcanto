import { isAdminAuthenticated } from '../../../_lib/admin-auth.js'

const LOGS_KEY='whatsapp:send_logs'

export async function onRequestPost(context) {
  const { request, env } = context
  if (!(await isAdminAuthenticated(request, env))) return json({ ok:false, message:'Não autorizado.' },401)
  if (!env.WASENDER_API_KEY) return json({ ok:false, message:'WASENDER_API_KEY não configurada no Cloudflare.' },500)

  let payload
  try { payload=await request.json() } catch { return json({ok:false,message:'Payload inválido.'},400) }

  const groups=Array.isArray(payload.groups)?payload.groups.filter(Boolean):[]
  const text=String(payload.text||'').trim()
  const imageUrl=String(payload.imageUrl||'').trim()
  const poll=normalizePoll(payload.poll)
  const itemId=String(payload.itemId||'')
  const title=String(payload.title||'Disparo manual')

  if(payload.poll){
    const response={ok:false,code:'POLL_DISABLED',message:'A enquete nativa está temporariamente desativada porque o formato ainda não foi validado no WhatsApp. Use uma votação em texto.'}
    await appendLog(env,{source:'manual',itemId,title,status:'BLOQUEADO',ok:false,groups,error:response.message,type:'poll'})
    return json(response,409)
  }
  if(!groups.length||(!text&&!imageUrl))return json({ok:false,message:'Informe os destinatários e um texto ou imagem.'},400)
  if(imageUrl&&!/^https:\/\//i.test(imageUrl))return json({ok:false,message:'A imagem precisa ter uma URL pública HTTPS.'},400)

  const apiUrl=env.WASENDER_API_URL||'https://app.wasenderapi.com/api/send-message'
  const results=[]
  for(const group of groups){
    try{
      const messagePayload=imageUrl?{to:group,text,imageUrl}:{to:group,text}
      const response=await fetch(apiUrl,{method:'POST',headers:{Authorization:`Bearer ${env.WASENDER_API_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(messagePayload)})
      const raw=await response.text();let body=raw;try{body=JSON.parse(raw)}catch{}
      results.push({group,ok:response.ok,acceptedByApi:response.ok,status:response.status,body,attemptedAt:new Date().toISOString()})
    }catch(error){
      results.push({group,ok:false,acceptedByApi:false,status:0,body:String(error?.message||error),attemptedAt:new Date().toISOString()})
    }
  }
  const ok=results.every(result=>result.ok)
  const partial=results.some(result=>result.ok)&&!ok
  await appendLog(env,{source:'manual',itemId,title,status:ok?'ACEITO_API':partial?'PARCIAL':'ERRO',ok,groups,results,type:imageUrl?'image':'text'})
  return json({ok,partial,results,media:Boolean(imageUrl),acceptedByApi:ok,message:ok?'Solicitação aceita pela API para todos os grupos.':partial?'Solicitação aceita apenas para parte dos grupos.':'Um ou mais envios falharam.'},ok?200:502)
}

function normalizePoll(value){
  if(!value||typeof value!=='object')return null
  const question=String(value.question||'').trim()
  const options=Array.isArray(value.options)?value.options.map(option=>String(option||'').trim()).filter(Boolean).slice(0,12):[]
  if(!question||options.length<2)return null
  return {question,options,multiSelect:Boolean(value.multiSelect)}
}

async function appendLog(env,entry){
  if(!env.FOCO_LINKS)return
  try{const logs=await env.FOCO_LINKS.get(LOGS_KEY,{type:'json'})||[];logs.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),...entry});await env.FOCO_LINKS.put(LOGS_KEY,JSON.stringify(logs.slice(0,200)))}catch{}
}

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
