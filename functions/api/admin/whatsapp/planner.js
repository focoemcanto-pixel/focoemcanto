import { isAdminAuthenticated } from '../../../_lib/admin-auth.js'

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

export async function onRequestPost({request,env}){
  if(!(await isAdminAuthenticated(request,env)))return json({ok:false,message:'Não autorizado.'},401)
  let body
  try{body=await request.json()}catch{return json({ok:false,message:'Comando inválido.'},400)}
  const command=String(body.command||'').trim()
  const items=Array.isArray(body.items)?body.items:[]
  if(!command)return json({ok:false,message:'Digite um comando.'},400)
  if(!env.OPENAI_API_KEY)return json({ok:true,reply:'Entendi o pedido. Posso organizar, duplicar ou filtrar a programação, mas a interpretação avançada depende da OPENAI_API_KEY.',action:null})
  try{
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-5-mini',input:[{role:'system',content:'Você é o planejador operacional do Foco OS. Analise comandos sobre agenda semanal e mensal de disparos WhatsApp. Responda em português, de forma objetiva, com recomendação prática. Não diga que executou nada. Quando o pedido for duplicar a semana, inclua exatamente ACTION:DUPLICATE ao final. Quando for apenas análise, use ACTION:NONE.'},{role:'user',content:`Comando: ${command}\nSemana inicial: ${body.weekStart||''}\nDisparos cadastrados: ${JSON.stringify(items.slice(0,40).map(x=>({date:x.date,time:x.time,title:x.title,status:x.status,poll:Boolean(x.poll),media:Boolean(x.imageUrl)})))}`}],max_output_tokens:450})})
    const data=await response.json()
    if(!response.ok)throw new Error(data?.error?.message||'Falha na OpenAI')
    const text=(data.output_text||data.output?.flatMap(o=>o.content||[]).map(c=>c.text||'').join('')||'').trim()
    const duplicate=/ACTION:DUPLICATE/i.test(text)
    return json({ok:true,reply:text.replace(/ACTION:(DUPLICATE|NONE)/gi,'').trim(),action:duplicate?'duplicate':null,confirmation:duplicate?'Duplicar os disparos da semana atual para a próxima semana?':null})
  }catch(error){return json({ok:false,message:error?.message||'Falha ao analisar o comando.'},502)}
}