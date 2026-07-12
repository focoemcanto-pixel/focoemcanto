import { isAdminAuthenticated } from '../../../_lib/admin-auth.js'

export async function onRequestPost(context) {
  const { request, env } = context

  if (!(await isAdminAuthenticated(request, env))) {
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
  const imageUrl = String(payload.imageUrl || '').trim()
  const poll = normalizePoll(payload.poll)

  if (!groups.length || (!text && !imageUrl && !poll)) {
    return json({ ok: false, message: 'Informe os destinatários e um texto, imagem ou enquete.' }, 400)
  }

  if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
    return json({ ok: false, message: 'A imagem precisa ter uma URL pública HTTPS.' }, 400)
  }

  if (payload.poll && !poll) {
    return json({ ok: false, message: 'A enquete precisa ter uma pergunta e entre 2 e 12 opções.' }, 400)
  }

  const apiUrl = env.WASENDER_API_URL || 'https://app.wasenderapi.com/api/send-message'
  const results = []

  for (const group of groups) {
    try {
      let messagePayload
      if (poll) messagePayload = { to: group, poll }
      else if (imageUrl) messagePayload = { to: group, text, imageUrl }
      else messagePayload = { to: group, text }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WASENDER_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(messagePayload),
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
  return json({
    ok,
    results,
    media: Boolean(imageUrl),
    poll: Boolean(poll),
    message: ok
      ? poll ? 'Enquete enviada.' : imageUrl ? 'Imagem e legenda enviadas.' : 'Envio concluído.'
      : 'Um ou mais envios falharam.',
  }, ok ? 200 : 502)
}

function normalizePoll(value) {
  if (!value || typeof value !== 'object') return null
  const question = String(value.question || '').trim()
  const options = Array.isArray(value.options)
    ? value.options.map((option) => String(option || '').trim()).filter(Boolean).slice(0, 12)
    : []
  if (!question || options.length < 2) return null
  return { question, options, multiSelect: Boolean(value.multiSelect) }
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