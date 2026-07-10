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

  const attribution = {
    linkId: item.id,
    slug: item.slug,
    source: item.source || '',
    medium: item.medium || '',
    campaign: item.campaign || '',
    content: item.content || '',
    product: item.product || '',
    clickedAt: item.lastClickAt,
  }
  const encoded = encodeURIComponent(JSON.stringify(attribution))
  const headers = new Headers({ Location: item.destinationUrl, 'Cache-Control': 'no-store' })
  headers.append('Set-Cookie', `foco_attribution=${encoded}; Path=/; Domain=.focoemcanto.com; Max-Age=2592000; SameSite=Lax; Secure`)
  return new Response(null, { status: 302, headers })
}
