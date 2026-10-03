import { isAdminAuthenticated } from '../../_lib/admin-auth.js';
export async function onRequest({ request, env, next }) {
  if (!(await isAdminAuthenticated(request, env)))
    return Response.json(
      { error: 'Sessão expirada. Entre no FocoOS.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  if (
    !['GET', 'HEAD'].includes(request.method) &&
    request.headers.get('Origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, headers });
}
