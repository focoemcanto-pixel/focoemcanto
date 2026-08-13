import { getAdminToken, isAdminAuthenticated } from '../_lib/admin-auth.js'

export async function onRequest(context) {
  const { request, env, next } = context
  const url = new URL(request.url)
  const adminToken = await getAdminToken(env)

  if (!adminToken) {
    return new Response('Token administrativo não configurado.', { status: 500 })
  }

  if (!(await isAdminAuthenticated(request, env))) {
    const login = new URL('/admin/login/', url.origin)
    login.searchParams.set('next', url.pathname)
    return Response.redirect(login.toString(), 302)
  }

  return next()
}
