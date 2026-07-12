import { processDueMessages } from '../../_lib/whatsapp-automation.js'

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

export async function onRequestPost({request,env}){
  const expected=String(env.CRON_SECRET||'')
  const provided=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||request.headers.get('x-cron-secret')||''
  if(!expected||provided!==expected)return json({ok:false,message:'Não autorizado.'},401)
  try{return json(await processDueMessages(env))}catch(error){return json({ok:false,message:error.message},500)}
}

export async function onRequestGet(){return json({ok:true,service:'whatsapp-scheduler'})}
