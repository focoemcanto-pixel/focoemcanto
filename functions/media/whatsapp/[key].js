export async function onRequestGet({params,env}){
  const key=String(params.key||'')
  if(!/^[a-f0-9-]+\.(jpg|png|webp|gif)$/i.test(key))return new Response('Arquivo inválido.',{status:400})

  if(env.FOCO_MEDIA){
    const object=await env.FOCO_MEDIA.get(key)
    if(object){
      const headers=new Headers()
      object.writeHttpMetadata(headers)
      headers.set('Cache-Control','public, max-age=31536000, immutable')
      headers.set('ETag',object.httpEtag)
      headers.set('X-Content-Type-Options','nosniff')
      return new Response(object.body,{headers})
    }
  }

  if(env.FOCO_LINKS){
    const result=await env.FOCO_LINKS.getWithMetadata(`media:${key}`,{type:'arrayBuffer'})
    if(result?.value){
      const headers=new Headers({
        'Content-Type':result.metadata?.contentType||'application/octet-stream',
        'Cache-Control':'public, max-age=86400',
        'X-Content-Type-Options':'nosniff'
      })
      return new Response(result.value,{headers})
    }
  }

  return new Response('Imagem não encontrada.',{status:404})
}