export default {
  async scheduled(_event,env,ctx){ctx.waitUntil(run(env))},
  async fetch(request,env){
    const url=new URL(request.url)
    if(url.pathname!=='/run')return new Response('WhatsApp Scheduler ativo.',{status:200})
    const expected=String(env.CRON_SECRET||'')
    const provided=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||''
    if(!expected||provided!==expected)return new Response('Não autorizado.',{status:401})
    const result=await run(env)
    return Response.json(result)
  },
}

async function run(env){
  const base=String(env.FOCO_OS_URL||'https://focoemcanto.com').replace(/\/$/,'')
  const response=await fetch(`${base}/api/cron/whatsapp`,{
    method:'POST',
    headers:{Authorization:`Bearer ${env.CRON_SECRET}`,Accept:'application/json'},
  })
  const text=await response.text();let body=text;try{body=JSON.parse(text)}catch{}
  if(!response.ok)throw new Error(`Foco OS respondeu ${response.status}: ${text}`)
  return body
}
