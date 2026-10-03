import {
  rpc,
  persistenceFailure,
  type BridgeEnv,
} from '../../../trade/bridge/config';
import { runScanner, tradeOwner } from '../../../trade/scanner/service';
export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: BridgeEnv;
}) {
  try {
    const u = new URL(request.url),
      source = u.searchParams.get('source') || 'replay';
    if (source !== 'mt5' && source !== 'replay')
      throw new Error('Fonte inválida');
    return Response.json(
      await runScanner(
        env,
        source,
        Number(u.searchParams.get('cursor') || 180),
        u.searchParams.get('run') || 'default',
      ),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json(
      e instanceof Error && !(e as any).code
        ? { error: e.message }
        : persistenceFailure(e),
      { status: 503 },
    );
  }
}
export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: BridgeEnv;
}) {
  try {
    const b: any = await request.json();
    await rpc(env, 'trade_watch_action', {
      p_owner: tradeOwner,
      p_scope: b.scope,
      p_id: b.id,
      p_action: b.action,
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: 'Não foi possível registrar a decisão.' },
      { status: 409 },
    );
  }
}
