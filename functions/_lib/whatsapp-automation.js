const SCHEDULE_KEY='whatsapp:schedule'
const SETTINGS_KEY='whatsapp:automation:settings'
const LOGS_KEY='whatsapp:send_logs'
const GROUPS_KEY='whatsapp:groups'
const DEFAULT_GROUPS=['120363404674461725@g.us','120363428159310476@g.us']
const MAX_ATTEMPTS=3
const LOCK_TTL_MS=5*60*1000

async function readActiveGroups(env){
  const saved=await env.FOCO_LINKS.get(GROUPS_KEY,{type:'json'})
  if(!Array.isArray(saved)||!saved.length)return DEFAULT_GROUPS
  return saved.filter(group=>group&&group.enabled!==false&&group.id).map(group=>String(group.id))
}

export async function getAutomationState(env){
  if(!env.FOCO_LINKS)throw new Error('FOCO_LINKS não configurado.')
  const settings=await env.FOCO_LINKS.get(SETTINGS_KEY,{type:'json'})||{}
  const items=await env.FOCO_LINKS.get(SCHEDULE_KEY,{type:'json'})||[]
  const activeGroups=await readActiveGroups(env)
  const now=new Date()
  const next=items.filter(item=>isEligible(item,now,activeGroups)).map(item=>({...item,dueAt:dueDate(item)})).filter(x=>x.dueAt>now).sort((a,b)=>a.dueAt-b.dueAt)[0]||null
  return {enabled:settings.enabled!==false,lastRunAt:settings.lastRunAt||null,lastRunStatus:settings.lastRunStatus||null,lastError:settings.lastError||null,lastTrigger:settings.lastTrigger||null,nextItem:next?{id:next.id,title:next.title,date:next.date,time:next.time}:null}
}

export async function setAutomationEnabled(env,enabled){
  const current=await env.FOCO_LINKS.get(SETTINGS_KEY,{type:'json'})||{}
  const next={...current,enabled:Boolean(enabled),updatedAt:new Date().toISOString()}
  await env.FOCO_LINKS.put(SETTINGS_KEY,JSON.stringify(next))
  return next
}

export async function processDueMessages(env,{force=false,trigger='cron'}={}){
  if(!env.FOCO_LINKS)throw new Error('FOCO_LINKS não configurado.')
  if(!env.WASENDER_API_KEY)throw new Error('WASENDER_API_KEY não configurada.')
  const settings=await env.FOCO_LINKS.get(SETTINGS_KEY,{type:'json'})||{}
  if(settings.enabled===false&&!force)return {ok:true,paused:true,processed:0,results:[]}
  const items=await env.FOCO_LINKS.get(SCHEDULE_KEY,{type:'json'})||[]
  const activeGroups=await readActiveGroups(env)
  const now=new Date()
  const due=items.filter(item=>isEligible(item,now,activeGroups)&&(force||dueDate(item)<=now)).slice(0,20)
  const results=[]
  for(const item of due){
    const runId=crypto.randomUUID()
    item.status='PROCESSANDO';item.processingAt=now.toISOString();item.lockId=runId;item.error=null
    item.deliveries=normalizeDeliveries(item)
    await saveItems(env,items)
    try{
      const sendResult=await sendItem(env,item,activeGroups,async()=>{item.updatedAt=new Date().toISOString();await saveItems(env,items)})
      const targets=getTargets(item,activeGroups)
      const successCount=targets.filter(target=>item.deliveries?.[target]?.ok).length
      const allOk=successCount===targets.length
      item.status=allOk?'ENVIADO':successCount>0?'PARCIAL':'ERRO'
      item.sentAt=allOk?new Date().toISOString():null
      item.error=allOk?null:`${targets.length-successCount} destino(s) ainda não receberam o disparo.`
      item.processingAt=null;item.lockId=null
      results.push({id:item.id,ok:allOk,status:item.status,results:sendResult,error:item.error})
      await appendLog(env,{source:'automatic',trigger,itemId:item.id,title:item.title,status:item.status,ok:allOk,results:sendResult,isTest:Boolean(item.isTest)})
    }catch(error){
      item.status='ERRO';item.error=String(error?.message||error);item.processingAt=null;item.lockId=null
      results.push({id:item.id,ok:false,status:item.status,error:item.error})
      await appendLog(env,{source:'automatic',trigger,itemId:item.id,title:item.title,status:'ERRO',ok:false,error:item.error,isTest:Boolean(item.isTest)})
    }
    item.updatedAt=new Date().toISOString();await saveItems(env,items)
  }
  const finished={...settings,lastRunAt:new Date().toISOString(),lastRunStatus:results.some(x=>!x.ok)?'ERRO':'OK',lastError:results.find(x=>!x.ok)?.error||null,lastTrigger:trigger}
  await env.FOCO_LINKS.put(SETTINGS_KEY,JSON.stringify(finished))
  return {ok:true,paused:false,processed:results.length,results}
}

function normalizeDeliveries(item){return item.deliveries&&typeof item.deliveries==='object'?item.deliveries:item.delivery&&typeof item.delivery==='object'?item.delivery:{}}
function getTargets(item,activeGroups){
  if(item.isTest===true){
    const number=String(item.testNumber||'').replace(/\D/g,'')
    if(!number)throw new Error('Disparo de teste sem número de teste configurado.')
    return[number]
  }
  const configured=Array.isArray(item.groups)&&item.groups.length?item.groups:activeGroups
  const activeSet=new Set(activeGroups)
  const filtered=configured.filter(group=>activeSet.has(group))
  if(!filtered.length)throw new Error('Nenhum grupo ativo configurado no Foco OS.')
  return filtered
}
function attemptsFor(item,to){return Number(item.deliveries?.[to]?.attempts||0)}
function isLocked(item,now){if(!item.processingAt)return false;const age=now-new Date(item.processingAt);return Number.isFinite(age)&&age<LOCK_TTL_MS}
function isEligible(item,now=new Date(),activeGroups=DEFAULT_GROUPS){
  if(!item||!['PENDENTE','ERRO','PARCIAL','PROCESSANDO'].includes(item.status)||item.autoEnabled===false||!item.date||!item.time)return false
  if(item.status==='PROCESSANDO'&&isLocked(item,now))return false
  let targets
  try{targets=getTargets(item,activeGroups)}catch{return false}
  const deliveries=normalizeDeliveries(item)
  return targets.some(to=>!deliveries[to]?.ok&&attemptsFor({...item,deliveries},to)<MAX_ATTEMPTS)
}
function dueDate(item){return new Date(`${item.date}T${item.time}:00-03:00`)}
async function saveItems(env,items){await env.FOCO_LINKS.put(SCHEDULE_KEY,JSON.stringify(items))}
async function appendLog(env,entry){try{const logs=await env.FOCO_LINKS.get(LOGS_KEY,{type:'json'})||[];logs.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),...entry});await env.FOCO_LINKS.put(LOGS_KEY,JSON.stringify(logs.slice(0,200)))}catch{}}

async function sendItem(env,item,activeGroups,onProgress){
  const targets=getTargets(item,activeGroups),apiUrl=env.WASENDER_API_URL||'https://app.wasenderapi.com/api/send-message',results=[]
  for(const to of targets){
    const previous=item.deliveries?.[to]
    if(previous?.ok){results.push({to,ok:true,skipped:true,status:previous.status||200,body:previous.body||null});continue}
    if(attemptsFor(item,to)>=MAX_ATTEMPTS){results.push({to,ok:false,skipped:true,final:true,status:previous?.status||0,body:'Limite de tentativas atingido.'});continue}
    let payload
    if(item.poll?.question&&Array.isArray(item.poll.options)&&item.poll.options.length>=2)payload={to,poll:{question:String(item.poll.question),options:item.poll.options.map(String).slice(0,12),multiSelect:Boolean(item.poll.multiSelect)}}
    else if(item.imageUrl)payload={to,text:String(item.message||''),imageUrl:String(item.imageUrl)}
    else if(item.message)payload={to,text:String(item.message)}
    else throw new Error('Disparo sem conteúdo.')
    try{
      const response=await fetch(apiUrl,{method:'POST',headers:{Authorization:`Bearer ${env.WASENDER_API_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)})
      const raw=await response.text();let body=raw;try{body=JSON.parse(raw)}catch{}
      const delivery={to,ok:response.ok,status:response.status,body,attempts:attemptsFor(item,to)+1,attemptedAt:new Date().toISOString(),acceptedByApi:response.ok,isTest:Boolean(item.isTest)}
      item.deliveries[to]=delivery;results.push(delivery);await onProgress?.()
    }catch(error){
      const delivery={to,ok:false,status:0,body:String(error?.message||error),attempts:attemptsFor(item,to)+1,attemptedAt:new Date().toISOString(),acceptedByApi:false,isTest:Boolean(item.isTest)}
      item.deliveries[to]=delivery;results.push(delivery);await onProgress?.()
    }
  }
  return results
}
