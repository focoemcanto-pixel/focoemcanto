import { generateMockCandles } from '../../../trade/core/providers';
import { runReplay } from '../../../trade/core/engine';
export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: any;
}) {
  if (!env.FOCO_LINKS)
    return Response.json(
      { error: 'Configure FOCO_LINKS para salvar execuções.' },
      { status: 503 }
    );
  const prefix = 'trade:v1:focoos-admin:runs:';
  if (request.method === 'GET') {
    const page = await env.FOCO_LINKS.list({ prefix, limit: 50 });
    const records = await Promise.all(
      page.keys.map((k: any) => env.FOCO_LINKS.get(k.name, 'json'))
    );
    return Response.json({
      records: records.filter(Boolean),
      limited: !page.list_complete,
    });
  }
  if (request.method !== 'POST')
    return Response.json({ error: 'Método não permitido.' }, { status: 405 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const cursor = Number(body.cursor);
  if (!Number.isInteger(cursor) || cursor < 1 || cursor > 420)
    return Response.json({ error: 'Cursor inválido.' }, { status: 400 });
  const state = runReplay(generateMockCandles(), cursor);
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: 'mock',
    dataset: 'synthetic-win-seed42-v1',
    cursor,
    strategy: 'trend_pullback_confirmation_v1',
    version: '1.0.0',
    parameters: state.parameters,
    signals: state.signals,
    trades: state.trades,
    metrics: state.metrics,
  };
  await env.FOCO_LINKS.put(prefix + record.id, JSON.stringify(record));
  return Response.json({ record }, { status: 201 });
}
