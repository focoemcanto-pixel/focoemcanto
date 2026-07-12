const SCHEDULE_KEY='whatsapp:schedule'
const SETTINGS_KEY='whatsapp:automation:settings'
const DEFAULT_GROUPS=['120363404674461725@g.us','120363428159310476@g.us']

export async function getAutomationState(env){
  if(!env.FOCO_LINKS)throw new Error('FOCO_LINKS não configurado.')
  const settings=await env.FOCO_LINKS.get(SETTINGS_KEY,{type:'json'})||{}
  const items=await env.FOCO_LINKS.get(SCHEDULE_KEY,{type:'json'})||[]
  const now=new Date()
  const next=items.filter(isEligible).map(item=>({...item,dueAt:dueDate(item)})).filter(x=>x.dueAt>now).sort((a,b)=>a.dueAt-b.dueAt)[0]||null
  return {
    enabled:settings.enabled!==false,
    lastRunAt:settings.lastRunAt||null,
    lastRunStatus:settings.lastRunStatus||null,
    lastError:settings.lastError||null,
    lastTrigger:settings.lastTrigger||null,
    nextItem:next?{id:next.id,title:next.title,date:next.date,time:next.time}:null,
  }
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
  const now=new Date()
  const due=items.filter(item=>isEligible(item)&&(force||dueDate(item)<=now)).slice(0,20)
  const results=[]

  for(const item of due){
    item.status='PROCESSANDO';item.processingAt=now.toISOString();item.error=null
    item.deliveries=item.deliveries&&typeof item.deliveries==='object'?item.deliveries:{}
    await env.FOCO_LINKS.put(SCHEDULE_KEY,JSON.stringify(items))
    try{
      const sendResult=await sendItem(env,item,async()=>{
        item.updatedAt=new Date().toISOString()
        await env.FOCO_LINKS.put(SCHEDULE_KEY,JSON.stringify(items))
      })
      const allOk=sendResult.every(x=>x.ok)
      item.status=allOk?'ENVIADO':'ERRO'
      item.sentAt=allOk?new Date().toISOString():null
      item.error=allOk?null:'Um ou mais grupos não receberam o disparo.'
      item.processingAt=null
      results.push({id:item.id,ok:allOk,results:sendResult,error:item.error})
    }catch(error){
      item.status='ERRO';item.error=String(error?.message||error);item.processingAt=null
      results.push({id:item.id,ok:false,error:item.error})
    }
    item.updatedAt=new Date().toISOString()
    await env.FOCO_LINKS.put(SCHEDULE_KEY,JSON.stringify(items))
  }

  const finished={...settings,lastRunAt:new Date().toISOString(),lastRunStatus:results.some(x=>!x.ok)?'ERRO':'OK',lastError:results.find(x=>!x.ok)?.error||null,lastTrigger:trigger}
  await env.FOCO_LINKS.put(SETTINGS_KEY,JSON.stringify(finished))
  return {ok:true,paused:false,processed:results.length,results}
}

function isEligible(item){
  return item&&['PENDENTE','ERRO'].includes(item.status)&&item.autoEnabled!==false&&item.date&&item.time
}

function dueDate(item){
  return new Date(`${item.date}T${item.time}:00-03:00`)
}

async function sendItem(env,item,onProgress){
  const groups=Array.isArray(item.groups)&&item.groups.length?item.groups:DEFAULT_GROUPS
  const apiUrl=env.WASENDER_API_URL||'https://app.wasenderapi.com/api/send-message'
  const results=[]
  for(const to of groups){
    if(item.deliveries?.[to]?.ok){
      results.push({to,ok:true,skipped:true,status:item.deliveries[to].status||200,body:item.deliveries[to].body||null})
      continue
    }
    let payload
    if(item.poll?.question&&Array.isArray(item.poll.options)&&item.poll.options.length>=2){
      payload={to,poll:{question:String(item.poll.question),options:item.poll.options.map(String).slice(0,12),multiSelect:Boolean(item.poll.multiSelect)}}
    }else if(item.imageUrl){payload={to,text:String(item.message||''),imageUrl:String(item.imageUrl)}}
    else if(item.message){payload={to,text:String(item.message)}}
    else throw new Error('Disparo sem conteúdo.')
    try{
      const response=await fetch(apiUrl,{method:'POST',headers:{Authorization:`Bearer ${env.WASENDER_API_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)})
      const raw=await response.text();let body=raw;try{body=JSON.parse(raw)}catch{}
      const delivery={to,ok:response.ok,status:response.status,body,attemptedAt:new Date().toISOString()}
      item.deliveries[to]=delivery
      results.push(delivery)
      await onProgress?.()
    }catch(error){
      const delivery={to,ok:false,status:0,body:String(error?.message||error),attemptedAt:new Date().toISOString()}
      item.deliveries[to]=delivery
      results.push(delivery)
      await onProgress?.()
    }
  }
  return results
}