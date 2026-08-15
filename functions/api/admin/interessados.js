import { isAdminAuthenticated } from '../../_lib/admin-auth.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

const clean = (value, max = 500) => String(value || '').trim().slice(0, max)

async function readLeads(kv) {
  const out = []
  let cursor
  let safety = 0
  do {
    const page = await kv.list({ prefix: 'aulas:lead:', cursor, limit: 200 })
    const values = await Promise.all(page.keys.map(key => kv.get(key.name, 'json')))
    out.push(...values.filter(Boolean))
    if (page.list_complete) break
    const next = page.cursor
    if (!next || next === cursor) break
    cursor = next
    safety += 1
  } while (safety < 20)
  return out
}

function normalizeLead(raw = {}) {
  return {
    id: clean(raw.id, 80),
    status: clean(raw.status || 'waiting', 30),
    name: clean(raw.name, 120) || 'Interessado',
    whatsapp: clean(raw.whatsapp, 30).replace(/\D/g, ''),
    modality: clean(raw.modality, 60),
    availability: Array.isArray(raw.availability)
      ? raw.availability.slice(0, 30).map(v => clean(v, 100)).filter(Boolean)
      : [],
    flexible: Boolean(raw.flexible),
    startIntent: clean(raw.startIntent, 100),
    goal: clean(raw.goal, 120),
    neighborhood: clean(raw.neighborhood, 120),
    city: clean(raw.city, 120),
    createdAt: clean(raw.createdAt, 50),
    updatedAt: clean(raw.updatedAt, 50),
  }
}

export async function onRequestGet({ request, env }) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: 'Não autorizado.' }, 401)
  if (!env?.FOCO_LINKS) return json({ error: 'Base indisponível.' }, 500)
  const leads = (await readLeads(env.FOCO_LINKS)).map(normalizeLead)
  leads.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return json({ leads, count: leads.length })
}

export async function onRequestPost({ request, env }) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: 'Não autorizado.' }, 401)
  if (!env?.FOCO_LINKS) return json({ error: 'Base indisponível.' }, 500)
  let body
  try { body = await request.json() } catch { return json({ error: 'Dados inválidos.' }, 400) }
  if (String(body.action || '') !== 'updateStatus') return json({ error: 'Ação desconhecida.' }, 400)
  const id = clean(body.id, 80)
  const allowed = ['waiting','contacted','offered','enrolled','inactive']
  const status = allowed.includes(body.status) ? body.status : 'waiting'
  const key = `aulas:lead:${id}`
  const lead = await env.FOCO_LINKS.get(key, 'json')
  if (!lead) return json({ error: 'Interessado não encontrado.' }, 404)
  const updated = { ...lead, status, updatedAt: new Date().toISOString() }
  await env.FOCO_LINKS.put(key, JSON.stringify(updated))
  return json({ ok: true, lead: normalizeLead(updated) })
}
