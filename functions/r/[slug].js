export async function onRequestGet(context) {
  const { env, params } = context
  if (!env.FOCO_LINKS) return new Response('FOCO_LINKS não configurado.', { status: 500 })

  const slug = String(params.slug || '').trim().toLowerCase()
  if (!slug) return new Response('Link inválido.', { status: 400 })

  const item = await env.FOCO_LINKS.get(`link:${slug}`, 'json')
  if (!item?.destinationUrl) return new Response('Link não encontrado.', { status: 404 })

  item.clicks = Number(item.clicks || 0) + 1
  item.lastClickAt = new Date().toISOString()
  context.waitUntil(env.FOCO_LINKS.put(`link:${slug}`, JSON.stringify(item)))

  return Response.redirect(item.destinationUrl, 302)
}
