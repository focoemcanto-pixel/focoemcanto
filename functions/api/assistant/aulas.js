const HUB_URL = 'https://jmhqdvracyjxqubqfgiz.supabase.co'
const HUB_PUBLISHABLE_KEY = 'sb_publishable_OvfVlykWZ3UfPpn3JARcEQ_0STjcgVF'
const allowedOrigins = new Set([
  'https://foco-assistente.pages.dev',
  'https://assistente.focoemcanto.com',
])

const cors = request => {
  const origin = request.headers.get('Origin') || ''
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://assistente.focoemcanto.com',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
  }
}
const json = (request, data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...cors(request), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
})
const clean = (value, max = 160) => String(value || '').trim().slice(0, max)
const addMinutes = (time, amount = 60) => {
  const [hour, minute] = clean(time, 10).split(':').map(Number)
  const total = (Number(hour) * 60) + Number(minute) + Number(amount || 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

async function authenticatedAdmin(request) {
  const authorization = request.headers.get('Authorization') || ''
  if (!authorization.startsWith('Bearer ')) return false
  const response = await fetch(`${HUB_URL}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: HUB_PUBLISHABLE_KEY },
  })
  if (!response.ok) return false
  const user = await response.json()
  return user?.app_metadata?.foco_assistant_admin === true
}

async function readPrefix(kv, prefix) {
  const output = []
  let cursor
  do {
    const page = await kv.list({ prefix, cursor, limit: 1000 })
    const values = await Promise.all(page.keys.map(key => kv.get(key.name, 'json')))
    output.push(...values.filter(Boolean))
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return output
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request) })
}

export async function onRequestGet({ request, env }) {
  if (!(await authenticatedAdmin(request))) return json(request, { error: 'Não autorizado.' }, 401)
  if (!env?.FOCO_LINKS) return json(request, { error: 'Agenda indisponível.' }, 500)
  const students = (await readPrefix(env.FOCO_LINKS, 'aulas:student:'))
    .filter(student => student?.status !== 'inactive' && student?.day && student?.time)
    .flatMap(student => {
      const durationMinutes = Number(student.durationMinutes || 60)
      const base = {
        id: clean(student.id, 80),
        name: clean(student.name, 120) || 'Aula',
        modality: clean(student.modality, 30),
        neighborhood: clean(student.neighborhood, 120),
        whatsapp: clean(student.whatsapp, 30).replace(/\D/g, ''),
        durationMinutes,
      }
      const rows = [{ ...base, occurrence: 1, day: clean(student.day, 20), time: clean(student.time, 10), endTime: clean(student.endTime, 10) || addMinutes(student.time, durationMinutes) }]
      if (Number(student.weeklyFrequency) === 2 && student.secondDay && student.secondTime) rows.push({ ...base, occurrence: 2, day: clean(student.secondDay, 20), time: clean(student.secondTime, 10), endTime: addMinutes(student.secondTime, durationMinutes) })
      return rows
    })
  const [leads, slots] = await Promise.all([
    readPrefix(env.FOCO_LINKS, 'aulas:lead:'),
    readPrefix(env.FOCO_LINKS, 'aulas:slot:'),
  ])
  const safeLeads = leads.map(lead => ({
    id: clean(lead.id,80), status: clean(lead.status || 'waiting',20), name: clean(lead.name,120),
    whatsapp: clean(lead.whatsapp,30), modality: clean(lead.modality,60),
    availability: Array.isArray(lead.availability) ? lead.availability.slice(0,30).map(v=>clean(v,120)) : [],
    flexible: Boolean(lead.flexible), startIntent: clean(lead.startIntent,100), goal: clean(lead.goal,160),
    neighborhood: clean(lead.neighborhood,120), city: clean(lead.city,120),
    createdAt: clean(lead.createdAt,40), updatedAt: clean(lead.updatedAt,40),
  })).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))
  const safeSlots = slots.map(slot => ({
    id: clean(slot.id,80), day: clean(slot.day,20), dayOrder: Number(slot.dayOrder || 9),
    time: clean(slot.time,10), endTime: clean(slot.endTime,10) || addMinutes(slot.time, Number(slot.durationMinutes || 60)),
    modality: clean(slot.modality,40), status: clean(slot.status || 'available',20),
    studentId: clean(slot.studentId,80), studentName: clean(slot.studentName,120),
  })).sort((a,b)=>`${a.dayOrder}-${a.time}`.localeCompare(`${b.dayOrder}-${b.time}`))
  return json(request, { classes: students, leads: safeLeads, slots: safeSlots, syncedAt: new Date().toISOString() })
}
