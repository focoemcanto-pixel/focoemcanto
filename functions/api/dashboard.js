export async function onRequestGet(context) {
  const { request, env } = context
  if (!isAuthenticated(request, env)) return json({ ok: false, message: 'Não autorizado.' }, 401)
  if (!env.FOCO_LINKS) return json({ ok: false, message: 'Binding FOCO_LINKS não configurado.' }, 500)

  const linkKeys = await env.FOCO_LINKS.list({ prefix: 'link:' })
  let clicks = 0
  const campaigns = new Set()
  const sources = new Set()
  for (const key of linkKeys.keys) {
    const item = await env.FOCO_LINKS.get(key.name, 'json')
    if (!item) continue
    clicks += Number(item.clicks || 0)
    if (item.campaign) campaigns.add(item.campaign)
    if (item.source) sources.add(item.source)
  }

  const funnelIds = (await env.FOCO_LINKS.get('foco:funnels:index', 'json')) || []
  let funnelLeads = 0
  let funnelSales = 0
  let funnelRevenue = 0
  let cost = 0
  let reach = 0
  let offerClicks = 0
  for (const id of funnelIds) {
    const item = await env.FOCO_LINKS.get(`foco:funnel:${id}`, 'json')
    if (!item) continue
    funnelLeads += number(item.leads)
    funnelSales += number(item.sales)
    funnelRevenue += number(item.revenue)
    cost += number(item.cost)
    reach += number(item.reach)
    offerClicks += number(item.offerClicks)
  }

  const crmLeads = (await env.FOCO_LINKS.get('crm:leads', 'json')) || []
  const crmClients = crmLeads.filter((item) => item.status === 'cliente')
  const crmRevenue = crmClients.reduce((sum, item) => sum + number(item.value), 0)

  const products = (await env.FOCO_LINKS.get('catalog:products', 'json')) || []
  const enrollments = (await env.FOCO_LINKS.get('catalog:enrollments', 'json')) || []
  const validEnrollments = enrollments.filter((item) => item.status !== 'cancelled')
  const activeStudents = enrollments.filter((item) => item.status === 'active')
  const enrollmentRevenue = validEnrollments.reduce((sum, item) => sum + number(item.amount), 0)

  const leads = crmLeads.length || funnelLeads
  const sales = validEnrollments.length || crmClients.length || funnelSales
  const revenue = enrollmentRevenue || crmRevenue || funnelRevenue

  return json({
    ok: true,
    summary: {
      links: linkKeys.keys.length,
      clicks,
      campaigns: campaigns.size,
      sources: sources.size,
      funnels: funnelIds.length,
      reach,
      leads,
      funnelLeads,
      offerClicks,
      sales,
      funnelSales,
      revenue,
      funnelRevenue,
      cost,
      crmLeads: crmLeads.length,
      crmClients: crmClients.length,
      products: products.length,
      enrollments: validEnrollments.length,
      activeStudents: activeStudents.length,
      conversion: leads > 0 ? (sales / leads) * 100 : 0,
      roi: cost > 0 ? (revenue - cost) / cost : null,
    },
  })
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

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}