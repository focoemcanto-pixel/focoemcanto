import { isAdminAuthenticated } from '../../_lib/admin-auth.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

async function readPrefix(kv, prefix) {
  const out = []
  let cursor
  do {
    const page = await kv.list({ prefix, cursor, limit: 1000 })
    cursor = page.list_complete ? undefined : page.cursor
    const values = await Promise.all(page.keys.map(key => kv.get(key.name, 'json')))
    out.push(...values.filter(Boolean))
  } while (cursor)
  return out
}

export async function onRequestGet({ request, env }) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: 'Não autorizado.' }, 401)
  if (!env?.FOCO_LINKS) return json({ error: 'Base indisponível.' }, 500)
  const [leads, slots] = await Promise.all([
    readPrefix(env.FOCO_LINKS, 'aulas:lead:'),
    readPrefix(env.FOCO_LINKS, 'aulas:slot:'),
  ])
  leads.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  slots.sort((a,b) => `${a.dayOrder || 9}-${a.time || ''}`.localeCompare(`${b.dayOrder || 9}-${b.time || ''}`))
  return json({ leads, slots })
}

export async function onRequestPost({ request, env }) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: 'Não autorizado.' }, 401)
  if (!env?.FOCO_LINKS) return json({ error: 'Base indisponível.' }, 500)
  let body
  try { body = await request.json() } catch { return json({ error: 'Dados inválidos.' }, 400) }
  const action = String(body.action || '')

  if (action === 'saveSlot') {
    const slot = body.slot || {}
    const id = String(slot.id || `${Date.now()}-${crypto.randomUUID().slice(0, 7)}`)
    const normalized = {
      id,
      day: String(slot.day || '').slice(0, 20),
      dayOrder: Number(slot.dayOrder || 9),
      time: String(slot.time || '').slice(0, 10),
      modality: String(slot.modality || 'Online').slice(0, 30),
      status: ['available','occupied','blocked'].includes(slot.status) ? slot.status : 'available',
      studentName: String(slot.studentName || '').slice(0, 120),
      studentWhatsapp: String(slot.studentWhatsapp || '').replace(/\D/g, '').slice(0, 20),
      updatedAt: new Date().toISOString(),
    }
    if (!normalized.day || !normalized.time) return json({ error: 'Dia e horário são obrigatórios.' }, 422)
    await env.FOCO_LINKS.put(`aulas:slot:${id}`, JSON.stringify(normalized))
    return json({ ok: true, slot: normalized })
  }

  if (action === 'deleteSlot') {
    const id = String(body.id || '')
    if (!id) return json({ error: 'ID inválido.' }, 400)
    await env.FOCO_LINKS.delete(`aulas:slot:${id}`)
    return json({ ok: true })
  }

  if (action === 'updateLeadStatus') {
    const id = String(body.id || '')
    const key = `aulas:lead:${id}`
    const lead = await env.FOCO_LINKS.get(key, 'json')
    if (!lead) return json({ error: 'Interessado não encontrado.' }, 404)
    const allowed = ['waiting','contacted','offered','enrolled','inactive']
    const status = allowed.includes(body.status) ? body.status : lead.status
    const updated = { ...lead, status, updatedAt: new Date().toISOString() }
    await env.FOCO_LINKS.put(key, JSON.stringify(updated))
    return json({ ok: true, lead: updated })
  }

  return json({ error: 'Ação desconhecida.' }, 400)
}
