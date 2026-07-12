import { isAdminAuthenticated } from '../../../_lib/admin-auth.js'
import { getAutomationState,processDueMessages,setAutomationEnabled } from '../../../_lib/whatsapp-automation.js'

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

export async function onRequestGet({request,env}){
  if(!(await isAdminAuthenticated(request,env)))return json({ok:false,message:'Não autorizado.'},401)
  try{return json({ok:true,...await getAutomationState(env)})}catch(error){return json({ok:false,message:error.message},500)}
}

export async function onRequestPost({request,env}){
  if(!(await isAdminAuthenticated(request,env)))return json({ok:false,message:'Não autorizado.'},401)
  try{
    const body=await request.json().catch(()=>({}))
    if(body.action==='toggle'){
      await setAutomationEnabled(env,Boolean(body.enabled))
      return json({ok:true,...await getAutomationState(env)})
    }
    if(body.action==='run')return json(await processDueMessages(env))
    return json({ok:false,message:'Ação inválida.'},400)
  }catch(error){return json({ok:false,message:error.message},500)}
}
