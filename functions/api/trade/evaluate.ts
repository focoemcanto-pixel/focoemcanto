import { generateMockCandles } from '../../../trade/core/providers';
import { runReplay } from '../../../trade/core/engine';
export async function onRequestGet({ request }: { request: Request }) {
  const url = new URL(request.url);
  const cursor = Number(url.searchParams.get('cursor') ?? 180);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > 420)
    return Response.json(
      { error: 'Cursor deve ser inteiro entre 0 e 420.' },
      { status: 400 }
    );
  return Response.json(runReplay(generateMockCandles(), cursor));
}
