const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

// Segurança financeira: nenhuma rota paga de IA roda por padrão.
// Só reativaremos quando o backend de créditos reservar/debitar saldo antes da chamada ao provedor.
export async function onRequest(context){
 const pathname=new URL(context.request.url).pathname
 const paidAiRoute=/\/api\/closet\/(scan|catalogize|try-on)(?:\/|$)/.test(pathname)
 if(paidAiRoute&&context.env.CLOSET_AI_ENABLED!=='true'){
  return json({ok:false,code:'closet_ai_locked',message:'Este recurso do Closet AI está temporariamente bloqueado até a cobrança segura por créditos ser ativada. O cadastro normal pela foto continua disponível sem IA.'},402)
 }
 return context.next()
}
