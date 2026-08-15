import { isAdminAuthenticated } from '../../_lib/admin-auth.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

const clean = (value, max = 500) => String(value || '').trim().slice(0, max)
const phone = value => clean(value, 30).replace(/\D/g, '')

async function readPrefix(kv, prefix) {
  const out = []
  let cursor
  let safety = 0
  do {
    const page = await kv.list({ prefix, cursor, limit: 500 })
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

function normalizeStudent(raw = {}) {
  return {
    ...raw,
    id: clean(raw.id, 80),
    name: clean(raw.name, 120) || 'Aluno sem nome',
    whatsapp: phone(raw.whatsapp),
    email: clean(raw.email, 160),
    modality: clean(raw.modality || 'Online', 30),
    address: clean(raw.address, 300),
    neighborhood: clean(raw.neighborhood, 120),
    city: clean(raw.city || 'Salvador', 120),
    day: clean(raw.day, 20),
    dayOrder: Number(raw.dayOrder || 9),
    time: clean(raw.time, 10),
    monthlyValue: clean(raw.monthlyValue, 30),
    paymentDay: clean(raw.paymentDay, 10),
    notes: clean(raw.notes, 1000),
    color: clean(raw.color, 20) || '#7427b9',
    status: raw.status === 'inactive' ? 'inactive' : 'active',
  }
}

export async function onRequestGet({ request, env }) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: 'Não autorizado.' }, 401)
  if (!env?.FOCO_LINKS) return json({ error: 'Base indisponível.' }, 500)
  const url = new URL(request.url)
  const only = url.searchParams.get('only')
  if (only === 'leads') {
    const leads = await readPrefix(env.FOCO_LINKS, 'aulas:lead:')
    leads.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    return json({ leads })
  }
  if (only === 'slots') {
    const slots = await readPrefix(env.FOCO_LINKS, 'aulas:slot:')
    slots.sort((a,b) => `${a.dayOrder || 9}-${a.time || ''}`.localeCompare(`${b.dayOrder || 9}-${b.time || ''}`))
    return json({ slots })
  }
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
      ...slot,
      id,
      day: clean(slot.day, 20),
      dayOrder: Number(slot.dayOrder || 9),
      time: clean(slot.time, 10),
      modality: clean(slot.modality || 'Online', 30),
      status: ['available','occupied','blocked'].includes(slot.status) ? slot.status : 'available',
      studentId: clean(slot.studentId, 80),
      studentName: clean(slot.studentName, 120),
      studentWhatsapp: phone(slot.studentWhatsapp),
      updatedAt: new Date().toISOString(),
    }
    if (!normalized.day || !normalized.time) return json({ error: 'Dia e horário são obrigatórios.' }, 422)
    await env.FOCO_LINKS.put(`aulas:slot:${id}`, JSON.stringify(normalized))
    return json({ ok: true, slot: normalized })
  }

  if (action === 'deleteSlot') {
    const id = clean(body.id, 80)
    if (!id) return json({ error: 'ID inválido.' }, 400)
    await env.FOCO_LINKS.delete(`aulas:slot:${id}`)
    return json({ ok: true })
  }

  if (action === 'updateLeadStatus') {
    const id = clean(body.id, 80)
    const key = `aulas:lead:${id}`
    const lead = await env.FOCO_LINKS.get(key, 'json')
    if (!lead) return json({ error: 'Interessado não encontrado.' }, 404)
    const allowed = ['waiting','contacted','offered','enrolled','inactive']
    const status = allowed.includes(body.status) ? body.status : lead.status
    const updated = { ...lead, status, updatedAt: new Date().toISOString() }
    await env.FOCO_LINKS.put(key, JSON.stringify(updated))
    return json({ ok: true, lead: updated })
  }

  if (action === 'fillSlotFromLead') {
    const leadId = clean(body.leadId, 80)
    const slotId = clean(body.slotId, 80)
    if (!leadId || !slotId) return json({ error: 'Interessado e horário são obrigatórios.' }, 422)

    const leadKey = `aulas:lead:${leadId}`
    const slotKey = `aulas:slot:${slotId}`
    const [lead, slot] = await Promise.all([
      env.FOCO_LINKS.get(leadKey, 'json'),
      env.FOCO_LINKS.get(slotKey, 'json'),
    ])
    if (!lead) return json({ error: 'Interessado não encontrado.' }, 404)
    if (!slot) return json({ error: 'Horário não encontrado.' }, 404)
    if (slot.status !== 'available' || slot.studentId) return json({ error: 'Essa vaga não está mais disponível.' }, 409)

    const leadModality = clean(lead.modality, 60).toLowerCase()
    let modality = clean(body.modality, 30)
    if (!['Online','Presencial'].includes(modality)) {
      if (slot.modality === 'Online' || slot.modality === 'Presencial') modality = slot.modality
      else if (leadModality.includes('online') && !leadModality.includes('presencial')) modality = 'Online'
      else if (leadModality.includes('presencial') && !leadModality.includes('online')) modality = 'Presencial'
      else modality = 'Online'
    }

    const studentId = `lead-${leadId}`.slice(0, 80)
    const previous = await env.FOCO_LINKS.get(`aulas:student:${studentId}`, 'json')
    const student = normalizeStudent({
      ...previous,
      id: studentId,
      name: lead.name,
      whatsapp: lead.whatsapp,
      email: lead.email,
      modality,
      address: lead.address || '',
      neighborhood: lead.neighborhood || '',
      city: lead.city || 'Salvador',
      day: slot.day,
      dayOrder: slot.dayOrder,
      time: slot.time,
      monthlyValue: clean(body.monthlyValue, 30) || (modality === 'Presencial' ? '600' : '500'),
      paymentDay: clean(body.paymentDay, 10) || '10',
      notes: `Convertido da lista de interesse. Objetivo: ${clean(lead.goal, 240)}`,
      color: clean(body.color, 20) || '#168c8c',
      status: 'active',
      createdAt: previous?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const occupiedSlot = {
      ...slot,
      modality,
      status: 'occupied',
      studentId,
      studentName: student.name,
      studentWhatsapp: student.whatsapp,
      updatedAt: new Date().toISOString(),
    }
    const updatedLead = { ...lead, status: 'enrolled', enrolledAt: new Date().toISOString(), enrolledSlotId: slotId, updatedAt: new Date().toISOString() }

    await Promise.all([
      env.FOCO_LINKS.put(`aulas:student:${studentId}`, JSON.stringify(student)),
      env.FOCO_LINKS.put(slotKey, JSON.stringify(occupiedSlot)),
      env.FOCO_LINKS.put(leadKey, JSON.stringify(updatedLead)),
    ])
    return json({ ok: true, student, slot: occupiedSlot, lead: updatedLead })
  }

  return json({ error: 'Ação desconhecida.' }, 400)
}
