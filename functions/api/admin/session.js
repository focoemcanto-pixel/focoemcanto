export async function onRequest(context) {
  const { request, env } = context

  if (!env.ADMIN_TOKEN) {
    return json({ ok: false, message: 'ADMIN_TOKEN não configurado.' }, 500)
  }

  if (request.method === 'GET') {
    return json({ ok: isAuthenticated(request, env) })
  }

  if (request.method === 'POST') {
    let body
    try { body = await request.json() } catch { return json({ ok: false, message: 'Payload inválido.' }, 400) }
    const token = String(body.token || '')
    if (token !== env.ADMIN_TOKEN) return json({ ok: false, message: 'Token inválido.' }, 401)

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': `foco_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`,
      },
    })
  }

  if (request.method === 'DELETE') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': 'foco_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
      },
    })
  }

  return json({ ok: false, message: 'Método não permitido.' }, 405)
}

function isAuthenticated(request, env) {
  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/(?:^|;\s*)foco_admin_session=([^;]+)/)
  return match && decodeURIComponent(match[1]) === env.ADMIN_TOKEN
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
