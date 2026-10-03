const json = (data, status = 200) => Response.json(data, { status });
export async function onRequest({ request, env }) {
  if (!env.FOCO_LINKS)
    return json(
      { error: 'Persistência indisponível: configure FOCO_LINKS.' },
      503
    );
  // This V1 reuses the single FocoOS administrator principal. Product data has its own namespace.
  const prefix = 'trade:v1:focoos-admin:journal:';
  if (request.method === 'GET') {
    const page = await env.FOCO_LINKS.list({ prefix, limit: 100 });
    const records = await Promise.all(
      page.keys.map((k) => env.FOCO_LINKS.get(k.name, 'json'))
    );
    return json({
      records: records
        .filter(Boolean)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      storage: 'cloudflare-kv',
      limited: !page.list_complete,
    });
  }
  if (request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'JSON inválido.' }, 400);
    }
    const note = String(body.note || '').trim();
    if (!note || note.length > 3000)
      return json({ error: 'Nota deve ter entre 1 e 3000 caracteres.' }, 400);
    const cursor = Number(body.cursor);
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > 420)
      return json({ error: 'Cursor inválido.' }, 400);
    const record = {
      id: crypto.randomUUID(),
      note,
      cursor,
      createdAt: new Date().toISOString(),
      source: 'mock',
      strategy: 'trend_pullback_confirmation_v1',
    };
    await env.FOCO_LINKS.put(prefix + record.id, JSON.stringify(record));
    return json({ record, storage: 'cloudflare-kv' }, 201);
  }
  return json({ error: 'Método não permitido.' }, 405);
}
