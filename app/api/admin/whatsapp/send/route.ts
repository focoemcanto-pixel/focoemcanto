import { NextResponse } from 'next/server'

type SendPayload = {
  to?: string
  text?: string
  imageUrl?: string
  videoUrl?: string
  gifUrl?: string
}

const apiUrl = process.env.WASENDER_API_URL || 'https://app.wasenderapi.com/api/send-message'

export async function POST(request: Request) {
  const apiKey = process.env.WASENDER_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        message: 'WASENDER_API_KEY não configurada no ambiente.',
      },
      { status: 500 },
    )
  }

  let payload: SendPayload

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: 'Payload inválido.',
      },
      { status: 400 },
    )
  }

  if (!payload.to || !payload.text) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Campos obrigatórios: to e text.',
      },
      { status: 400 },
    )
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const bodyText = await response.text()
  let body: unknown = bodyText

  try {
    body = JSON.parse(bodyText)
  } catch {
    // Mantém resposta em texto quando a API não retorna JSON.
  }

  return NextResponse.json(
    {
      ok: response.ok,
      status: response.status,
      body,
    },
    { status: response.ok ? 200 : response.status },
  )
}
