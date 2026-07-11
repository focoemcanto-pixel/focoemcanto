import { isAdminAuthenticated } from '../_lib/admin-auth.js'

const KEY = 'assistant:campaigns'
const SCHEDULE_KEY = 'whatsapp:schedule'
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
})
const clean = (value) => String(value || '').trim()
const slug = (value) => clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function read(env) {
  if (!env.FOCO_LINKS) throw new Error('FOCO_LINKS não configurado.')
  return await env.FOCO_LINKS.get(KEY, { type: 'json' }) || []
}

function buildPlan(payload) {
  const product = clean(payload.product) || 'Produto Foco em Canto'
  const goal = clean(payload.goal) || 'vendas'
  const theme = clean(payload.theme) || `transformação com ${product}`
  const audience = clean(payload.audience) || 'cantores que desejam evoluir tecnicamente'
  const startDate = clean(payload.startDate) || new Date().toISOString().slice(0, 10)
  return {
    title: clean(payload.title) || `Campanha ${product} — ${theme}`,
    product, goal, theme, audience, startDate,
    destination: clean(payload.destination),
    status: 'draft',
    strategy: ['Diagnóstico da dor', 'Quebra de objeção', 'Demonstração de método', 'Prova e autoridade', 'Convite para a oferta', 'Urgência e fechamento'],
    content: [
      { channel: 'Reel', day: 'Segunda', title: `O erro que impede ${audience} de avançar`, cta: 'Comente EU QUERO' },
      { channel: 'Stories', day: 'Terça', title: `Bastidores: como resolver ${theme}`, cta: 'Responder enquete' },
      { channel: 'WhatsApp', day: 'Quarta', title: `Convite para aula ao vivo sobre ${theme}`, cta: 'Entrar na live' },
      { channel: 'Live', day: 'Quarta 20h', title: `Aula principal: ${theme}`, cta: `Conhecer ${product}` },
      { channel: 'WhatsApp', day: 'Quinta', title: 'Resumo, prova e abertura da oferta', cta: 'Ver oferta' },
      { channel: 'Stories', day: 'Sexta', title: 'Objeções frequentes e casos reais', cta: 'Enviar dúvida' },
      { channel: 'WhatsApp', day: 'Domingo', title: 'Fechamento e última chamada', cta: 'Garantir vaga' },
    ],
    messages: [
      { type: 'Aquecimento', text: `Você sente que ainda não consegue avançar em ${theme}? Nesta semana vou mostrar um caminho prático para mudar isso.` },
      { type: 'Convite', text: `Nesta quarta, às 20h, teremos uma aula especial sobre ${theme}. Separe esse horário — vai ser direto ao ponto.` },
      { type: 'Oferta', text: `As inscrições para ${product} estão abertas. É o próximo passo para quem quer transformar conhecimento em resultado com direção e acompanhamento.` },
      { type: 'Fechamento', text: `Última chamada para entrar no ${product}. Depois de hoje, esta condição sai do ar.` },
    ],
    links: [
      { name: 'Instagram', source: 'instagram', medium: 'social', campaign: slug(product), content: 'reel' },
      { name: 'WhatsApp', source: 'whatsapp', medium: 'grupo', campaign: slug(product), content: 'live' },
      { name: 'Stories', source: 'instagram', medium: 'stories', campaign: slug(product), content: 'oferta' },
    ],
    provider: 'rules',
  }
}

async function businessContext(env) {
  if (!env.FOCO_LINKS) return {}
  const [products, leads, enrollments] = await Promise.all([
    env.FOCO_LINKS.get('catalog:products', { type: 'json' }),
    env.FOCO_LINKS.get('crm:leads', { type: 'json' }),
    env.FOCO_LINKS.get('catalog:enrollments', { type: 'json' }),
  ])
  return {
    products: (products || []).slice(0, 20).map((x) => ({ name: x.name, price: x.price, status: x.status, description: x.description })),
    metrics: {
      leads: (leads || []).length,
      clients: (leads || []).filter((x) => x.status === 'cliente').length,
      enrollments: (enrollments || []).filter((x) => x.status !== 'cancelled').length,
      revenue: (enrollments || []).filter((x) => x.status !== 'cancelled').reduce((sum, x) => sum + Number(x.amount || 0), 0),
    },
  }
}

const campaignSchema = {
  type: 'object', additionalProperties: false,
  required: ['title', 'product', 'goal', 'theme', 'audience', 'startDate', 'strategy', 'content', 'messages', 'links'],
  properties: {
    title: { type: 'string' }, product: { type: 'string' }, goal: { type: 'string' }, theme: { type: 'string' }, audience: { type: 'string' }, startDate: { type: 'string' },
    strategy: { type: 'array', items: { type: 'string' } },
    content: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['channel', 'day', 'title', 'cta'], properties: { channel: { type: 'string' }, day: { type: 'string' }, title: { type: 'string' }, cta: { type: 'string' } } } },
    messages: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'text'], properties: { type: { type: 'string' }, text: { type: 'string' } } } },
    links: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'source', 'medium', 'campaign', 'content'], properties: { name: { type: 'string' }, source: { type: 'string' }, medium: { type: 'string' }, campaign: { type: 'string' }, content: { type: 'string' } } } },
  },
}

async function generateWithOpenAI(env, payload) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada.')
  const context = await businessContext(env)
  const instructions = 'Você é o Assistente Operacional do Foco OS, especializado em marketing digital para produtos de canto. Crie campanhas práticas, específicas, humanas e orientadas a conversão. Público principal: cantores, ministros de louvor e pessoas que querem desenvolver técnica vocal. Canais disponíveis: Instagram, Stories, Reels, WhatsApp, grupos e lives semanais às quartas às 20h. Não use promessas milagrosas. Gere textos naturais em português do Brasil. Retorne somente o JSON estruturado solicitado.'
  const input = { command: clean(payload.prompt), fields: { title: clean(payload.title), product: clean(payload.product), theme: clean(payload.theme), audience: clean(payload.audience), goal: clean(payload.goal), startDate: clean(payload.startDate) }, businessContext: context }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-5-mini', instructions, input: JSON.stringify(input), text: { format: { type: 'json_schema', name: 'foco_campaign', strict: true, schema: campaignSchema } } }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || 'Falha ao gerar campanha com a OpenAI.')
  const outputText = data.output_text || data.output?.flatMap((x) => x.content || []).find((x) => x.type === 'output_text')?.text
  if (!outputText) throw new Error('A OpenAI não retornou conteúdo utilizável.')
  return { ...JSON.parse(outputText), destination: clean(payload.destination), status: 'draft', provider: 'openai', model: data.model || env.OPENAI_MODEL || 'gpt-5-mini' }
}

function addDays(date, amount) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + amount)
  return d.toISOString().slice(0, 10)
}

async function addMessagesToSchedule(env, campaign, links) {
  const schedule = await env.FOCO_LINKS.get(SCHEDULE_KEY, { type: 'json' }) || []
  if (schedule.some((x) => x.campaignId === campaign.id)) return schedule.filter((x) => x.campaignId === campaign.id)
  const shortLink = links.find((x) => /whatsapp/i.test(x.name))?.slug
  const destination = shortLink ? `/r/${shortLink}` : campaign.destination || ''
  const presets = [
    { offset: 0, time: '19:00' },
    { offset: 2, time: '19:30' },
    { offset: 3, time: '10:00' },
    { offset: 6, time: '19:00' },
  ]
  const createdAt = new Date().toISOString()
  const generated = (campaign.messages || []).map((message, index) => ({
    id: `ai_${campaign.id}_${index}`,
    date: addDays(campaign.startDate, presets[index]?.offset ?? index),
    time: presets[index]?.time || '19:00',
    title: `${campaign.title} — ${message.type}`,
    message: `${message.text}${destination ? `\n\n👉 ${destination}` : ''}`,
    status: 'PENDENTE', sentAt: null, error: null,
    campaignId: campaign.id, source: 'assistant-ai', createdAt, updatedAt: createdAt,
  }))
  const merged = [...schedule, ...generated].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  await env.FOCO_LINKS.put(SCHEDULE_KEY, JSON.stringify(merged))
  return generated
}

async function activate(env, campaign) {
  const now = new Date().toISOString()
  const executionId = `exec_${campaign.id}`
  const operation = {
    id: executionId, campaignId: campaign.id, title: campaign.title, status: 'ready', createdAt: now,
    tasks: [
      ...(campaign.content || []).map((x, i) => ({ id: `content_${i}`, type: 'content', status: 'pending', ...x })),
      ...(campaign.messages || []).map((x, i) => ({ id: `message_${i}`, type: 'message', status: 'pending', title: x.type, text: x.text })),
    ],
  }
  await env.FOCO_LINKS.put(`operation:${campaign.id}`, JSON.stringify(operation))

  const funnelId = `ai_${campaign.id}`
  const funnelIds = await env.FOCO_LINKS.get('foco:funnels:index', { type: 'json' }) || []
  if (!funnelIds.includes(funnelId)) {
    funnelIds.unshift(funnelId)
    await env.FOCO_LINKS.put('foco:funnels:index', JSON.stringify(funnelIds))
  }
  await env.FOCO_LINKS.put(`foco:funnel:${funnelId}`, JSON.stringify({ id: funnelId, name: campaign.title, source: 'assistente-ia', campaign: slug(campaign.title), product: campaign.product, reach: 0, clicks: 0, leads: 0, offerClicks: 0, sales: 0, revenue: 0, cost: 0, createdAt: now, updatedAt: now }))

  const createdLinks = []
  if (campaign.destination) {
    for (const [index, link] of (campaign.links || []).entries()) {
      let url
      try { url = new URL(/^https?:\/\//i.test(campaign.destination) ? campaign.destination : `https://${campaign.destination}`) } catch { continue }
      const id = `ai_${campaign.id}_${index}`
      const linkSlug = slug(`${campaign.title}-${link.name}`)
      url.searchParams.set('utm_source', slug(link.source)); url.searchParams.set('utm_medium', slug(link.medium)); url.searchParams.set('utm_campaign', slug(link.campaign || campaign.title)); url.searchParams.set('utm_content', slug(link.content)); url.searchParams.set('fo_id', id)
      const item = { id, slug: linkSlug, name: `${campaign.title} — ${link.name}`, destination: campaign.destination, destinationUrl: url.toString(), source: slug(link.source), medium: slug(link.medium), campaign: slug(link.campaign || campaign.title), content: slug(link.content), product: slug(campaign.product), clicks: 0, createdAt: now, updatedAt: now, lastClickAt: null }
      await env.FOCO_LINKS.put(`link:${linkSlug}`, JSON.stringify(item))
      createdLinks.push(item)
    }
  }
  const scheduledMessages = await addMessagesToSchedule(env, campaign, createdLinks)
  return { operationId: executionId, funnelId, links: createdLinks.map((x) => ({ slug: x.slug, name: x.name })), scheduledMessages: scheduledMessages.length }
}

export async function onRequestGet(c) {
  if (!(await isAdminAuthenticated(c.request, c.env))) return json({ ok: false, message: 'Não autorizado.' }, 401)
  try { return json({ ok: true, campaigns: await read(c.env), aiConfigured: Boolean(c.env.OPENAI_API_KEY), model: c.env.OPENAI_MODEL || 'gpt-5-mini' }) } catch (e) { return json({ ok: false, message: e.message }, 500) }
}

export async function onRequestPost(c) {
  if (!(await isAdminAuthenticated(c.request, c.env))) return json({ ok: false, message: 'Não autorizado.' }, 401)
  try {
    const payload = await c.request.json()
    const items = await read(c.env)
    const now = new Date().toISOString()
    let item
    if (payload.action === 'generate') {
      let plan, warning = ''
      try { plan = await generateWithOpenAI(c.env, payload) } catch (e) { plan = buildPlan(payload); warning = e.message }
      item = { id: crypto.randomUUID(), ...plan, prompt: clean(payload.prompt), createdAt: now, updatedAt: now, warning }
    } else if (payload.action === 'activate') {
      const old = items.find((x) => x.id === payload.id)
      if (!old) return json({ ok: false, message: 'Campanha não encontrada.' }, 404)
      const activation = await activate(c.env, old)
      item = { ...old, status: 'ready', activation, activatedAt: now, updatedAt: now }
    } else {
      const old = items.find((x) => x.id === payload.id) || {}
      item = { ...old, ...payload, id: payload.id || crypto.randomUUID(), updatedAt: now, createdAt: old.createdAt || now }
    }
    const index = items.findIndex((x) => x.id === item.id)
    index >= 0 ? items.splice(index, 1, item) : items.unshift(item)
    await c.env.FOCO_LINKS.put(KEY, JSON.stringify(items))
    return json({ ok: true, campaign: item, provider: item.provider, warning: item.warning || '' })
  } catch (e) { return json({ ok: false, message: e.message }, 500) }
}

export async function onRequestDelete(c) {
  if (!(await isAdminAuthenticated(c.request, c.env))) return json({ ok: false, message: 'Não autorizado.' }, 401)
  try {
    const { id } = await c.request.json()
    const items = (await read(c.env)).filter((x) => x.id !== id)
    await c.env.FOCO_LINKS.put(KEY, JSON.stringify(items))
    await c.env.FOCO_LINKS.delete(`operation:${id}`)
    return json({ ok: true })
  } catch (e) { return json({ ok: false, message: e.message }, 500) }
}
