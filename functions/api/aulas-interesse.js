function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max)
}

function normalizePhone(value) {
  return clean(value, 30).replace(/\D/g, '')
}

export async function onRequestPost({ request, env }) {
  if (!env?.FOCO_LINKS) return json({ error: 'Base de dados indisponível.' }, 500)

  let body
  try { body = await request.json() } catch { return json({ error: 'Dados inválidos.' }, 400) }

  const name = clean(body.name, 120)
  const whatsapp = normalizePhone(body.whatsapp)
  const modality = clean(body.modality, 60)
  let availability = []
  try { availability = JSON.parse(body.availability || '[]') } catch {}
  availability = Array.isArray(availability) ? availability.map(item => clean(item, 60)).filter(Boolean).slice(0, 30) : []

  if (!name || whatsapp.length < 10 || !modality || !availability.length || body.acceptedTerms !== 'sim') {
    return json({ error: 'Preencha os campos obrigatórios e confirme as condições.' }, 422)
  }

  const now = new Date().toISOString()
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const lead = {
    id,
    createdAt: now,
    updatedAt: now,
    status: 'waiting',
    name,
    whatsapp,
    instagram: clean(body.instagram, 120),
    source: clean(body.source, 80),
    modality,
    neighborhood: clean(body.neighborhood, 120),
    city: clean(body.city, 120),
    availability,
    flexible: body.flexible === 'sim',
    level: clean(body.level, 80),
    startIntent: clean(body.startIntent, 100),
    goal: clean(body.goal, 120),
    experience: clean(body.experience, 1000),
  }

  await env.FOCO_LINKS.put(`aulas:lead:${id}`, JSON.stringify(lead))
  return json({ ok: true, id }, 201)
}
