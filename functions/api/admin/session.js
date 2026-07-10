import { getAdminToken, isAdminAuthenticated } from '../../_lib/admin-auth.js'

export async function onRequest(context) {
  const { request, env } = context
  const adminToken = await getAdminToken(env)

  if (!adminToken) {
    return json({
      ok: false,
      message: 'Token administrativo não encontrado. Configure ADMIN_TOKEN, FOCO_ADMIN_TOKEN ou a chave config:admin_token no KV FOCO_LINKS.',
    }, 500)
  }

  if (request.method === 'GET') {
    return json({ ok: await isAdminAuthenticated(request, env) })
  }

  if (request.method === 'POST') {
    let body
    try { body = await request.json() } catch { return json({ ok: false, message: 'Payload inválido.' }, 400) }
    const token = String(body.token || '').trim()
    if (token !== adminToken) return json({ ok: false, message: 'Token inválido.' }, 401)

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': `foco_admin_session=${encodeURIComponent(adminToken)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`,
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
