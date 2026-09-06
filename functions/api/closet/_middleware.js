const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

// As próprias rotas de IA autenticam o usuário, validam saldo, debitam créditos
// antes do provedor e fazem estorno em falha. Este middleware fica apenas como
// kill switch explícito de emergência; ausência da variável NÃO bloqueia o Closet AI.
export async function onRequest(context){
 const pathname=new URL(context.request.url).pathname
 const paidAiRoute=/\/api\/closet\/(scan|catalogize|try-on)(?:\/|$)/.test(pathname)
 if(paidAiRoute&&context.env.CLOSET_AI_CREDITS_ENABLED==='false'){
  return json({ok:false,code:'closet_ai_locked',message:'O Closet AI está temporariamente indisponível. Nenhum crédito foi gasto.'},503)
 }
 return context.next()
}
