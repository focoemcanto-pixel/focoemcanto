import { isAdminAuthenticated } from '../../../_lib/admin-auth.js'

const KEY='whatsapp:send_logs'
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

export async function onRequestGet({request,env}){
  if(!(await isAdminAuthenticated(request,env)))return json({ok:false,message:'Não autorizado.'},401)
  if(!env.FOCO_LINKS)return json({ok:false,message:'FOCO_LINKS não configurado.'},500)
  try{return json({ok:true,logs:await env.FOCO_LINKS.get(KEY,{type:'json'})||[]})}catch(error){return json({ok:false,message:error.message},500)}
}

export async function onRequestDelete({request,env}){
  if(!(await isAdminAuthenticated(request,env)))return json({ok:false,message:'Não autorizado.'},401)
  if(!env.FOCO_LINKS)return json({ok:false,message:'FOCO_LINKS não configurado.'},500)
  try{await env.FOCO_LINKS.put(KEY,'[]');return json({ok:true,logs:[]})}catch(error){return json({ok:false,message:error.message},500)}
}
