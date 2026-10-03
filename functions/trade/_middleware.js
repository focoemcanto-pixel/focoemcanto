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
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (response.ok && headers.get('Content-Type')?.includes('text/html')) {
    // Register before Next assets: an old tab may reference chunks removed
    // by a deployment. Recover once instead of leaving an inert SSR screen.
    const html = (await response.text()).replace('<head>', '<head><script src="/trade-boot.js" data-cfasync="false"></script>');
    headers.delete('Content-Length');
    headers.delete('ETag');
    return new Response(html, { status: response.status, headers });
  }
  return new Response(response.body, { status: response.status, headers });
}
