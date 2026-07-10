const INDEX_KEY = 'foco:funnels:index'

export async function onRequest(context) {
  const { request, env } = context
  if (!env.FOCO_LINKS) return json({ ok: false, message: 'Binding FOCO_LINKS não configurado.' }, 500)

  if (request.method === 'GET') return handleGet(env)
  if (request.method === 'POST') return handlePost(request, env)
  if (request.method === 'DELETE') return handleDelete(request, env)
  return json({ ok: false, message: 'Método não permitido.' }, 405)
}

async function handleGet(env) {
  const ids = (await env.FOCO_LINKS.get(INDEX_KEY, 'json')) || []
  const funnels = []
  for (const id of ids) {
    const item = await env.FOCO_LINKS.get(`foco:funnel:${id}`, 'json')
    if (item) funnels.push(item)
  }
  funnels.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  return json({ ok: true, funnels })
}

async function handlePost(request, env) {
  if (!authorized(request, env)) return json({ ok: false, message: 'Token administrativo inválido.' }, 401)
  let body
  try { body = await request.json() } catch { return json({ ok: false, message: 'Payload inválido.' }, 400) }

  const id = String(body.id || `fun_${Date.now()}`)
  const existing = await env.FOCO_LINKS.get(`foco:funnel:${id}`, 'json')
  const now = new Date().toISOString()
  const funnel = {
    id,
    name: String(body.name || '').trim(),
    campaign: String(body.campaign || '').trim(),
    product: String(body.product || '').trim(),
    reach: number(body.reach),
    clicks: number(body.clicks),
    leads: number(body.leads),
    offerClicks: number(body.offerClicks),
    sales: number(body.sales),
    revenue: number(body.revenue),
    cost: number(body.cost),
    notes: String(body.notes || '').trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }

  if (!funnel.name) return json({ ok: false, message: 'Informe o nome do funil.' }, 400)
  await env.FOCO_LINKS.put(`foco:funnel:${id}`, JSON.stringify(funnel))
  const ids = (await env.FOCO_LINKS.get(INDEX_KEY, 'json')) || []
  if (!ids.includes(id)) {
    ids.unshift(id)
    await env.FOCO_LINKS.put(INDEX_KEY, JSON.stringify(ids.slice(0, 500)))
  }
  return json({ ok: true, funnel })
}

async function handleDelete(request, env) {
  if (!authorized(request, env)) return json({ ok: false, message: 'Token administrativo inválido.' }, 401)
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return json({ ok: false, message: 'ID obrigatório.' }, 400)
  await env.FOCO_LINKS.delete(`foco:funnel:${id}`)
  const ids = ((await env.FOCO_LINKS.get(INDEX_KEY, 'json')) || []).filter((item) => item !== id)
  await env.FOCO_LINKS.put(INDEX_KEY, JSON.stringify(ids))
  return json({ ok: true })
}

function authorized(request, env) {
  if (!env.ADMIN_TOKEN) return false
  const header = request.headers.get('Authorization') || ''
  return header === `Bearer ${env.ADMIN_TOKEN}`
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
