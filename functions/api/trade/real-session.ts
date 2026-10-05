import {
  config,
  rpc,
  persistenceFailure,
  PersistenceError,
  type BridgeEnv,
} from '../../../trade/bridge/config';
import { realContext, realReadiness } from '../../../trade/bridge/real';
const owner = 'focoos-admin'; // Existing admin-session middleware, never client supplied.
export const armConfirmation = 'ARMAR SESSÃO REAL';
/** REAL session state and its arming checklist. Reading never arms anything. */
export async function onRequestGet({ env }: { env: BridgeEnv }) {
  try {
    return Response.json(realReadiness(await realContext(env), env), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return Response.json(persistenceFailure(e), { status: 503 });
  }
}
/**
 * arm: deliberate, temporary arming after the checklist (rechecked in Postgres). It only releases
 * the kill switch for the session; it never creates a proposal, a command or an order.
 * disarm: immediate, always allowed.
 */
export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: BridgeEnv;
}) {
  let body: any = {};
  try {
    body = await request.json();
    const c = config(env);
    if (body.action === 'disarm') {
      await rpc(env, 'trade_real_disarm', {
        p_bridge: c.bridgeId,
        p_reason: 'MANUAL',
      });
      return Response.json(realReadiness(await realContext(env), env));
    }
    if (body.action !== 'arm') throw new Error('Ação inválida');
    if (body.confirmation !== armConfirmation)
      throw new Error('Confirmação deliberada obrigatória para armar o REAL.');
    const minutes = Number(body.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480)
      throw new Error('Duração da sessão inválida.');
    const before = realReadiness(await realContext(env), env);
    if (!before.canArm)
      return Response.json(
        {
          error:
            'REAL NÃO ARMADO: ' +
            before.armingGates
              .filter((g) => !g.ok)
              .map((g) => g.label)
              .join(' · '),
          real: before,
        },
        { status: 409 },
      );
    await rpc(env, 'trade_real_arm', {
      p_owner: owner,
      p_bridge: c.bridgeId,
      p_minutes: minutes,
      p_account: c.accountHash,
      p_age: c.maxAgeMs,
      p_backend: c.execution,
      p_confirmation: body.confirmation,
    });
    return Response.json(realReadiness(await realContext(env), env));
  } catch (e) {
    return Response.json(
      e instanceof PersistenceError
        ? persistenceFailure(e)
        : { error: e instanceof Error ? e.message : 'REAL não armado' },
      { status: 409 },
    );
  }
}
