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
    const items=Array.isArray(body.items)?body.items:[]
    const normalized=items.map(x=>({
      id:String(x.id||crypto.randomUUID()),date:String(x.date||''),time:String(x.time||'19:00'),title:String(x.title||'Mensagem'),message:String(x.message||''),
      status:String(x.status||'PENDENTE'),sentAt:x.sentAt||null,error:x.error||null,campaignId:x.campaignId||null,source:x.source||'manual',
      groups:Array.isArray(x.groups)?x.groups:undefined,imageUrl:String(x.imageUrl||''),
      poll:x.poll&&typeof x.poll==='object'?{question:String(x.poll.question||''),options:Array.isArray(x.poll.options)?x.poll.options.map(String).filter(Boolean).slice(0,12):[],multiSelect:Boolean(x.poll.multiSelect)}:null,
      weekId:x.weekId||null,tags:Array.isArray(x.tags)?x.tags.map(String):[],
      autoEnabled:x.autoEnabled!==false,processingAt:x.processingAt||null,
      deliveries:x.deliveries&&typeof x.deliveries==='object'?x.deliveries:{},
      createdAt:x.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),
    }))
    await c.env.FOCO_LINKS.put(KEY,JSON.stringify(normalized))
    return json({ok:true,items:normalized})
  }catch(e){return json({ok:false,message:e.message},500)}
}