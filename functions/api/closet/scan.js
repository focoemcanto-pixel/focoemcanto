const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
})

const itemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name','category','color','subcategory','pattern','style','confidence','box'],
  properties: {
    name: { type: 'string' },
    category: { type: 'string', enum: ['Blusas','Calças','Vestidos','Calçados','Bolsas','Acessórios'] },
    color: { type: 'string' },
    subcategory: { type: 'string' },
    pattern: { type: 'string' },
    style: { type: 'string' },
    confidence: { type: 'number' },
    box: {
      type: 'object', additionalProperties: false,
      required: ['x','y','width','height'],
      properties: {
        x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' },
      },
    },
  },
}

const scanSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['valid','reason','items'],
  properties: {
    valid: { type: 'boolean' },
    reason: { type: 'string' },
    items: { type: 'array', maxItems: 8, items: itemSchema },
  },
}

function outputText(data) {
  return data.output_text || data.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text || ''
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.OPENAI_API_KEY) return json({ ok: false, message: 'Scanner ainda não configurado.' }, 503)
    const body = await request.json()
    const image = String(body?.image || '')
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image)) return json({ ok: false, message: 'Imagem inválida.' }, 400)
    if (image.length > 8_000_000) return json({ ok: false, message: 'Imagem muito grande. Tente novamente.' }, 413)

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.CLOSET_VISION_MODEL || 'gpt-5.6-luna',
        instructions: `Você é o scanner visual de um guarda-roupa virtual. Detecte TODAS as peças de moda utilizáveis visíveis na foto, inclusive quando estiverem vestidas em uma pessoa: blusa/camisa/suéter, calça/saia/short, vestido, calçados, bolsa e acessórios relevantes. Não trate a pessoa como uma peça. Não inclua celular, capacete, móveis, comida ou objetos domésticos. Uma peça deve ter confidence >= 0.65. Para cada peça, forneça uma caixa delimitadora apertada em coordenadas normalizadas de 0 a 1000: x e y são canto superior esquerdo; width e height são dimensões. A caixa deve conter principalmente aquela peça e evitar rosto, mãos e outras roupas quando possível. Se houver duas ou mais roupas, retorne cada uma como item separado. Se não houver nenhuma peça válida, valid=false e items=[]. Nomes curtos em português do Brasil; não invente detalhes invisíveis.`,
        input: [{ role: 'user', content: [
          { type: 'input_text', text: 'Analise a foto para cadastro rápido no closet. Quantas peças de roupa/moda existem? Separe cada peça e dê a caixa individual para que o app recorte uma por uma.' },
          { type: 'input_image', image_url: image, detail: 'high' },
        ]}],
        text: { format: { type: 'json_schema', name: 'closet_multi_scan', strict: true, schema: scanSchema } },
      }),
    })
    const data = await response.json()
    if (!response.ok) return json({ ok: false, message: data?.error?.message || 'Não consegui analisar a foto.' }, 502)
    const text = outputText(data)
    if (!text) return json({ ok: false, message: 'O scanner não retornou uma análise.' }, 502)
    const result = JSON.parse(text)
    result.items = Array.isArray(result.items) ? result.items.filter(i => i.confidence >= .65) : []
    result.valid = result.items.length > 0
    return json({ ok: true, scan: result, model: data.model || env.CLOSET_VISION_MODEL || 'gpt-5.6-luna' })
  } catch (error) {
    return json({ ok: false, message: error?.message || 'Falha ao analisar a foto.' }, 500)
  }
}
