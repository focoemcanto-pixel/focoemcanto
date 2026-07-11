export async function onRequestGet({params,env}){
  if(!env.FOCO_MEDIA)return new Response('FOCO_MEDIA não configurado.',{status:500})
  const key=String(params.key||'')
  if(!/^[a-f0-9-]+\.(jpg|png|webp|gif)$/i.test(key))return new Response('Arquivo inválido.',{status:400})
  const object=await env.FOCO_MEDIA.get(key)
  if(!object)return new Response('Imagem não encontrada.',{status:404})
  const headers=new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control','public, max-age=31536000, immutable')
  headers.set('ETag',object.httpEtag)
  headers.set('X-Content-Type-Options','nosniff')
  return new Response(object.body,{headers})
}
