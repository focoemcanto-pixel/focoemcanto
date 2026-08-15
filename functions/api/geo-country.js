function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}

export async function onRequestGet({ request }) {
  const cfCountry = String(request?.cf?.country || '').trim().toUpperCase()
  const headerCountry = String(request.headers.get('CF-IPCountry') || '').trim().toUpperCase()
  const country = /^[A-Z]{2}$/.test(cfCountry) ? cfCountry : (/^[A-Z]{2}$/.test(headerCountry) ? headerCountry : '')
  return json({ country: country || null })
}
