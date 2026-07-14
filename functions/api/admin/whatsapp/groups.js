import { isAdminAuthenticated } from '../../../_lib/admin-auth.js'

const GROUPS_KEY='whatsapp:groups'
const SCHEDULE_KEY='whatsapp:schedule'
const DEFAULT_GROUPS=[
  {id:'120363404674461725@g.us',name:'LIVE - FOCO EM CANTO',enabled:true},
  {id:'120363428159310476@g.us',name:'#2 LIVE - FOCO EM CANTO',enabled:true},
]
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

async function readGroups(env){
  if(!env.FOCO_LINKS)throw new Error('FOCO_LINKS não configurado.')
  const saved=await env.FOCO_LINKS.get(GROUPS_KEY,{type:'json'})
  return Array.isArray(saved)&&saved.length?saved:DEFAULT_GROUPS
}

export async function onRequestGet({request,env}){
  if(!(await isAdminAuthenticated(request,env)))return json({ok:false,message:'Não autorizado.'},401)
  try{return json({ok:true,groups:await readGroups(env)})}catch(error){return json({ok:false,message:error.message},500)}
}

export async function onRequestPost({request,env}){
  if(!(await isAdminAuthenticated(request,env)))return json({ok:false,message:'Não autorizado.'},401)
  try{
    const body=await request.json()
    const groups=(Array.isArray(body.groups)?body.groups:[]).map(group=>({
      id:String(group.id||'').trim(),
      name:String(group.name||'Grupo WhatsApp').trim(),
      enabled:group.enabled!==false,
      reconnectedAt:group.reconnectedAt||null,
    })).filter(group=>group.id)
    if(!groups.length)return json({ok:false,message:'Mantenha pelo menos um grupo configurado.'},400)
    await env.FOCO_LINKS.put(GROUPS_KEY,JSON.stringify(groups))

    if(body.applyToPending!==false){
      const items=await env.FOCO_LINKS.get(SCHEDULE_KEY,{type:'json'})||[]
      const activeIds=groups.filter(group=>group.enabled).map(group=>group.id)
      const reconnectIds=Array.isArray(body.reconnectIds)?body.reconnectIds.map(String):[]
      for(const item of items){
        if(item.isTest||['ENVIADO','PROCESSANDO'].includes(item.status))continue
        item.groups=activeIds
        item.deliveries=item.deliveries&&typeof item.deliveries==='object'?item.deliveries:{}
        reconnectIds.forEach(id=>{delete item.deliveries[id]})
        if(item.status==='PARCIAL'||item.status==='ERRO')item.status='PENDENTE'
        item.error=null
        item.updatedAt=new Date().toISOString()
      }
      await env.FOCO_LINKS.put(SCHEDULE_KEY,JSON.stringify(items))
    }
    return json({ok:true,groups,message:'Grupos atualizados.'})
  }catch(error){return json({ok:false,message:error.message},500)}
}
