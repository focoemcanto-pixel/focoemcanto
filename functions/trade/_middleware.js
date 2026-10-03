import { isAdminAuthenticated } from '../_lib/admin-auth.js';
export async function onRequest({ request, env, next }) {
  if (!(await isAdminAuthenticated(request, env))) {
    const login = new URL('/admin/login/', request.url);
    login.searchParams.set('next', '/trade/');
    return Response.redirect(login, 302);
  }
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, { status: response.status, headers });
}
