export async function onRequestPost(context) {
  const { request, env } = context

  if (!isAuthenticated(request, env)) {
    return json({ ok: false, message: 'Não autorizado.' }, 401)
  }

  if (!env.WASENDER_API_KEY) {
    return json({ ok: false, message: 'WASENDER_API_KEY não configurada no Cloudflare.' }, 500)
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ ok: false, message: 'Payload inválido.' }, 400)
  }

  const groups = Array.isArray(payload.groups) ? payload.groups.filter(Boolean) : []
  const text = String(payload.text || '').trim()

  if (!groups.length || !text) {
    return json({ ok: false, message: 'Informe groups e text.' }, 400)
  }

  const apiUrl = env.WASENDER_API_URL || 'https://app.wasenderapi.com/api/send-message'
  const results = []

  for (const group of groups) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WASENDER_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ to: group, text }),
      })

      const raw = await response.text()
      let body = raw
      try { body = JSON.parse(raw) } catch {}

      results.push({ group, ok: response.ok, status: response.status, body })
    } catch (error) {
      results.push({ group, ok: false, status: 0, body: String(error?.message || error) })
    }
  }

  const ok = results.every((result) => result.ok)
  return json({ ok, results, message: ok ? 'Envio concluído.' : 'Um ou mais envios falharam.' }, ok ? 200 : 502)
}

function isAuthenticated(request, env) {
  if (!env.ADMIN_TOKEN) return false
  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/(?:^|;\s*)foco_admin_session=([^;]+)/)
  if (match && decodeURIComponent(match[1]) === env.ADMIN_TOKEN) return true
  const token = request.headers.get('X-Admin-Token') || ''
  const auth = request.headers.get('Authorization') || ''
  return token === env.ADMIN_TOKEN || auth === `Bearer ${env.ADMIN_TOKEN}`
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
