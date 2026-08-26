const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

// Segurança financeira: as rotas pagas só abrem quando o backend de créditos
// estiver explicitamente ativado. Cada rota ainda precisa debitar antes do provedor.
export async function onRequest(context){
 const pathname=new URL(context.request.url).pathname
 const paidAiRoute=/\/api\/closet\/(scan|catalogize|try-on)(?:\/|$)/.test(pathname)
 if(paidAiRoute&&context.env.CLOSET_AI_CREDITS_ENABLED!=='true'){
  return json({ok:false,code:'closet_ai_locked',message:'O Closet AI ainda está protegido. O cadastro normal pela foto continua disponível sem IA.'},402)
 }
 return context.next()
}
