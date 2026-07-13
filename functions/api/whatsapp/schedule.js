import { isAdminAuthenticated } from '../../_lib/admin-auth.js'

const KEY='whatsapp:schedule'
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

async function read(env){
  if(!env.FOCO_LINKS)throw new Error('FOCO_LINKS não configurado.')
  return await env.FOCO_LINKS.get(KEY,{type:'json'})||[]
}

export async function onRequestGet(c){
  if(!(await isAdminAuthenticated(c.request,c.env)))return json({ok:false,message:'Não autorizado.'},401)
  try{return json({ok:true,items:await read(c.env)})}catch(e){return json({ok:false,message:e.message},500)}
}

export async function onRequestPost(c){
  if(!(await isAdminAuthenticated(c.request,c.env)))return json({ok:false,message:'Não autorizado.'},401)
  try{
    const body=await c.request.json()
    const incoming=Array.isArray(body.items)?body.items:[]
    const current=await read(c.env)
    const currentById=new Map(current.map(item=>[String(item.id),item]))
    const normalized=incoming.map(x=>{
      const id=String(x.id||crypto.randomUUID())
      const saved=currentById.get(id)||{}
      const deliveries=x.deliveries&&typeof x.deliveries==='object'?x.deliveries:x.delivery&&typeof x.delivery==='object'?x.delivery:saved.deliveries&&typeof saved.deliveries==='object'?saved.deliveries:{}
      return {
        id,date:String(x.date||''),time:String(x.time||'19:00'),title:String(x.title||'Mensagem'),message:String(x.message||''),
        status:String(x.status||saved.status||'PENDENTE'),sentAt:x.sentAt||saved.sentAt||null,error:x.error??saved.error??null,campaignId:x.campaignId||saved.campaignId||null,source:x.source||saved.source||'manual',
        groups:Array.isArray(x.groups)?x.groups:Array.isArray(saved.groups)?saved.groups:undefined,imageUrl:String(x.imageUrl||saved.imageUrl||''),
        poll:x.poll&&typeof x.poll==='object'?{question:String(x.poll.question||''),options:Array.isArray(x.poll.options)?x.poll.options.map(String).filter(Boolean).slice(0,12):[],multiSelect:Boolean(x.poll.multiSelect)}:saved.poll||null,
        weekId:x.weekId||saved.weekId||null,tags:Array.isArray(x.tags)?x.tags.map(String):Array.isArray(saved.tags)?saved.tags:[],
        autoEnabled:x.autoEnabled!==undefined?x.autoEnabled!==false:saved.autoEnabled!==false,
        processingAt:x.processingAt??saved.processingAt??null,lockId:x.lockId??saved.lockId??null,
        deliveries,manualTargets:Array.isArray(x.manualTargets)?x.manualTargets:saved.manualTargets||undefined,
        createdAt:x.createdAt||saved.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),
      }
    })
    await c.env.FOCO_LINKS.put(KEY,JSON.stringify(normalized))
    return json({ok:true,items:normalized,source:'kv'})
  }catch(e){return json({ok:false,message:e.message},500)}
}
