const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
})

const itemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name','category','color','brand','label_text','subcategory','pattern','style','confidence','box'],
  properties: {
    name: { type: 'string' },
    category: { type: 'string', enum: ['Blusas','Calças','Vestidos','Calçados','Bolsas','Acessórios'] },
    color: { type: 'string' },
    brand: { type: 'string' },
    label_text: { type: 'string' },
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
        instructions: `Você é um scanner visual extremamente cuidadoso para um guarda-roupa virtual. Detecte TODAS as peças de moda utilizáveis visíveis na foto, inclusive quando estiverem vestidas em uma pessoa: blusa/camisa/suéter, calça/saia/short, vestido, calçados, bolsa e acessórios relevantes. Não trate a pessoa como uma peça. Não inclua celular, capacete, móveis, comida ou objetos domésticos.

PRECISÃO DE COR: não simplifique tons claros para branco se houver nuance perceptível. Diferencie branco puro, off-white, creme, marfim, bege claro, areia, cinza claro, azul-marinho, grafite etc. Considere a iluminação da cena e tente inferir a cor real do tecido, não apenas o pixel mais iluminado. Se a peça parecer off-white/creme em vez de branca, use exatamente esse nome. Não invente uma nuance sem evidência.

MARCA E ETIQUETA: examine logos, bordados, etiquetas internas, etiquetas externas e textos legíveis na peça. Em brand, retorne a marca SOMENTE quando o texto/logo estiver legível com confiança; caso contrário retorne string vazia. Em label_text, transcreva somente o que conseguir ler de verdade, sem completar palavras por adivinhação. Nunca invente marca. Dê prioridade especial à região da gola/etiqueta quando visível.

Para cada peça, forneça uma caixa delimitadora apertada em coordenadas normalizadas de 0 a 1000: x e y são canto superior esquerdo; width e height são dimensões. A caixa deve conter principalmente aquela peça e evitar rosto, mãos e outras roupas quando possível. Se houver duas ou mais roupas, retorne cada uma como item separado. Uma peça deve ter confidence >= 0.65. Se não houver nenhuma peça válida, valid=false e items=[]. Nomes curtos em português do Brasil; não invente detalhes invisíveis.`,
        input: [{ role: 'user', content: [
          { type: 'input_text', text: 'Analise esta foto com máxima precisão para cadastro no closet. Identifique todas as peças, a cor real específica de cada uma e qualquer marca/etiqueta realmente legível. Separe cada peça com sua caixa individual.' },
          { type: 'input_image', image_url: image, detail: 'high' },
        ]}],
        text: { format: { type: 'json_schema', name: 'closet_multi_scan_precise', strict: true, schema: scanSchema } },
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
