import { realContext, realReadiness } from '../../../trade/bridge/real';
import { readinessDimensions } from '../../../trade/bridge/readiness';
import { MT5MarketDataProvider } from '../../../trade/bridge/mt5';
import {
  persistenceFailure,
  type BridgeEnv,
} from '../../../trade/bridge/config';
/**
 * Existing FocoOS admin middleware, never exports fingerprint, policy secrets or tokens. Always returns
 * the readiness dimensions; a failing REAL context is reported with its real cause (code, operation,
 * HTTP status) and never turns a LIVE feed / connected EA into OFFLINE / disconnected.
 */
export async function onRequestGet({ env }: { env: BridgeEnv }) {
  try {
    const ctx = await realContext(env);
    return Response.json({
      paper: 'OPERACIONAL',
      readiness: readinessDimensions(ctx?.bridge, env, ctx),
      real: realReadiness(ctx, env),
    });
  } catch (e) {
    const failure = persistenceFailure(e);
    const bridge = await new MT5MarketDataProvider(env).status().catch(() => null);
    return Response.json(
      {
        paper: 'OPERACIONAL',
        readiness: readinessDimensions(bridge, env, null),
        real: {
          status: 'REAL INDISPONÍVEL',
          canExecute: false,
          pipeline: 'IMPLEMENTADO',
          error: failure,
          gates: [
            {
              key: 'persistence',
              ok: false,
              label: 'Contexto REAL (persistência / política)',
              reason: `${failure.error} [${failure.code}${'operation' in failure && failure.operation ? ` · ${failure.operation}` : ''}${'httpStatus' in failure && failure.httpStatus ? ` · HTTP ${failure.httpStatus}` : ''}]`,
            },
          ],
        },
        ...failure,
      },
      { status: 503 },
    );
  }
}
