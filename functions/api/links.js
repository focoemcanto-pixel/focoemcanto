export async function onRequestGet(context) {
  const { request, env } = context
  const auth = authorize(request, env)
  if (auth) return auth
  if (!env.FOCO_LINKS) return json({ ok: false, message: 'Binding KV FOCO_LINKS não configurado.' }, 500)

  const listed = await env.FOCO_LINKS.list({ prefix: 'link:' })
  const links = []
  for (const key of listed.keys) {
    const item = await env.FOCO_LINKS.get(key.name, 'json')
    if (item) links.push(item)
  }
  links.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  return json({ ok: true, links })
}

export async function onRequestPost(context) {
  const { request, env } = context
  const auth = authorize(request, env)
  if (auth) return auth
  if (!env.FOCO_LINKS) return json({ ok: false, message: 'Binding KV FOCO_LINKS não configurado.' }, 500)

  let payload
  try { payload = await request.json() } catch { return json({ ok: false, message: 'Payload inválido.' }, 400) }

  const required = ['name', 'destination', 'source', 'medium', 'campaign']
  for (const field of required) {
    if (!String(payload[field] || '').trim()) return json({ ok: false, message: `Campo obrigatório: ${field}.` }, 400)
  }

  let destination
  try {
    const raw = /^https?:\/\//i.test(payload.destination) ? payload.destination : `https://${payload.destination}`
    destination = new URL(raw)
  } catch {
    return json({ ok: false, message: 'URL de destino inválida.' }, 400)
  }

  const id = String(payload.id || `lnk_${Date.now()}`)
  const slug = sanitizeSlug(payload.slug || payload.name) || id.toLowerCase()
  const previousSlug = sanitizeSlug(payload.previousSlug || '')
  const existing = await env.FOCO_LINKS.get(`link:${slug}`, 'json')
  if (existing && existing.id !== id) return json({ ok: false, message: 'Esse slug já está em uso.' }, 409)

  destination.searchParams.set('utm_source', sanitizeSlug(payload.source))
  destination.searchParams.set('utm_medium', sanitizeSlug(payload.medium))
  destination.searchParams.set('utm_campaign', sanitizeSlug(payload.campaign))
  if (payload.content) destination.searchParams.set('utm_content', sanitizeSlug(payload.content))
  if (payload.product) destination.searchParams.set('utm_term', sanitizeSlug(payload.product))
  destination.searchParams.set('fo_id', id)

  const item = {
    id,
    slug,
    name: String(payload.name).trim(),
    destination: String(payload.destination).trim(),
    destinationUrl: destination.toString(),
    source: sanitizeSlug(payload.source),
    medium: sanitizeSlug(payload.medium),
    campaign: sanitizeSlug(payload.campaign),
    content: sanitizeSlug(payload.content || ''),
    product: sanitizeSlug(payload.product || ''),
    clicks: Number(existing?.clicks || payload.clicks || 0),
    createdAt: existing?.createdAt || payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastClickAt: existing?.lastClickAt || null,
  }

  await env.FOCO_LINKS.put(`link:${slug}`, JSON.stringify(item))
  if (previousSlug && previousSlug !== slug) await env.FOCO_LINKS.delete(`link:${previousSlug}`)
  return json({ ok: true, link: item })
}

export async function onRequestDelete(context) {
  const { request, env } = context
  const auth = authorize(request, env)
  if (auth) return auth
  if (!env.FOCO_LINKS) return json({ ok: false, message: 'Binding KV FOCO_LINKS não configurado.' }, 500)

  const url = new URL(request.url)
  const slug = sanitizeSlug(url.searchParams.get('slug') || '')
  if (!slug) return json({ ok: false, message: 'Informe o slug.' }, 400)
  await env.FOCO_LINKS.delete(`link:${slug}`)
  return json({ ok: true })
}

function authorize(request, env) {
  if (!env.ADMIN_TOKEN) return json({ ok: false, message: 'ADMIN_TOKEN não configurado.' }, 500)
  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/(?:^|;\s*)foco_admin_session=([^;]+)/)
  if (match && decodeURIComponent(match[1]) === env.ADMIN_TOKEN) return null
  const token = request.headers.get('X-Admin-Token') || ''
  const bearer = request.headers.get('Authorization') || ''
  if (token === env.ADMIN_TOKEN || bearer === `Bearer ${env.ADMIN_TOKEN}`) return null
  return json({ ok: false, message: 'Não autorizado.' }, 401)
}

function sanitizeSlug(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
