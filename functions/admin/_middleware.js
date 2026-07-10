export async function onRequest(context) {
  const { request, env, next } = context
  const url = new URL(request.url)

  if (url.pathname.startsWith('/admin/login')) return next()
  if (!env.ADMIN_TOKEN) return new Response('ADMIN_TOKEN não configurado.', { status: 500 })

  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/(?:^|;\s*)foco_admin_session=([^;]+)/)
  const authenticated = match && decodeURIComponent(match[1]) === env.ADMIN_TOKEN

  if (!authenticated) {
    const login = new URL('/admin/login/', url.origin)
    login.searchParams.set('next', url.pathname)
    return Response.redirect(login.toString(), 302)
  }

  return next()
}
