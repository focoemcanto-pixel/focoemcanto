export async function getAdminToken(env) {
  const direct = [env?.ADMIN_TOKEN, env?.FOCO_ADMIN_TOKEN, env?.ADMIN_SECRET]
    .map((value) => String(value || '').trim())
    .find(Boolean)

  if (direct) return direct

  if (env?.FOCO_LINKS) {
    const stored = String((await env.FOCO_LINKS.get('config:admin_token')) || '').trim()
    if (stored) return stored
  }

  return ''
}

export async function isAdminAuthenticated(request, env) {
  const token = await getAdminToken(env)
  if (!token) return false

  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/(?:^|;\s*)foco_admin_session=([^;]+)/)
  if (match && decodeURIComponent(match[1]) === token) return true

  const headerToken = request.headers.get('X-Admin-Token') || ''
  const authorization = request.headers.get('Authorization') || ''
  return headerToken === token || authorization === `Bearer ${token}`
}
