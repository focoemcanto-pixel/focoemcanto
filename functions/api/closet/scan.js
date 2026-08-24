const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
})

const scanSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['valid', 'reason', 'name', 'category', 'color', 'subcategory', 'pattern', 'style', 'confidence'],
  properties: {
    valid: { type: 'boolean' },
    reason: { type: 'string' },
    name: { type: 'string' },
    category: { type: 'string', enum: ['Blusas','Calças','Vestidos','Calçados','Bolsas','Acessórios',''] },
    color: { type: 'string' },
    subcategory: { type: 'string' },
    pattern: { type: 'string' },
    style: { type: 'string' },
    confidence: { type: 'number' },
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
        instructions: `Você é o scanner visual de um guarda-roupa virtual. Sua função é aceitar apenas uma peça de vestuário, calçado, bolsa ou acessório de moda claramente identificável na foto. Rejeite comida, móveis, ambientes, pessoas sem uma peça isolável, animais, objetos domésticos, eletrônicos e imagens em que a roupa não possa ser identificada com segurança. Se houver uma peça válida, classifique-a em exatamente uma das categorias permitidas. Dê nomes curtos em português do Brasil e descreva cor principal, subtipo, estampa e estilo aparente. Não invente detalhes invisíveis. confidence vai de 0 a 1. Se confidence < 0.65, valid deve ser false.`,
        input: [{ role: 'user', content: [
          { type: 'input_text', text: 'Analise esta foto para cadastro no closet. Existe uma peça válida de moda para ser recortada e usada em composição de looks?' },
          { type: 'input_image', image_url: image, detail: 'low' },
        ]}],
        text: { format: { type: 'json_schema', name: 'closet_scan', strict: true, schema: scanSchema } },
      }),
    })
    const data = await response.json()
    if (!response.ok) return json({ ok: false, message: data?.error?.message || 'Não consegui analisar a foto.' }, 502)
    const text = outputText(data)
    if (!text) return json({ ok: false, message: 'O scanner não retornou uma análise.' }, 502)
    const result = JSON.parse(text)
    return json({ ok: true, scan: result, model: data.model || env.CLOSET_VISION_MODEL || 'gpt-5.6-luna' })
  } catch (error) {
    return json({ ok: false, message: error?.message || 'Falha ao analisar a foto.' }, 500)
  }
}
