export type BridgeEnv = {
  TRADE_SUPABASE_URL?: string;
  TRADE_SUPABASE_SERVICE_KEY?: string;
  TRADE_BRIDGE_TOKEN?: string;
  TRADE_BRIDGE_ID?: string;
  TRADE_MT5_SYMBOL?: string;
  TRADE_ACCOUNT_HASH?: string;
  TRADE_EXECUTION_ENABLED?: string;
  TRADE_MAX_CONTRACTS?: string;
  TRADE_FEED_MAX_AGE_MS?: string;
};
// PAPER risk comes only from the persisted, versioned risk settings (trade/bridge/risk-settings.ts).
// There is no hardcoded or environment fallback: without settings a PAPER proposal is RISK_BLOCKED.
/** REAL per-trade risk limit: the approved policy, tightened by the EA local limit. No defaults. */
export function realRiskLimit(ctx: any): {
  maxRiskBRL: number | null;
  source: string;
} {
  const policy = ctx?.policy?.max_risk_brl,
    local = ctx?.bridge?.state?.localLimits?.maxRiskBRL,
    pos = (v: unknown): v is number =>
      typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (!pos(policy))
    return { maxRiskBRL: null, source: 'policy.max_risk_brl ausente' };
  return pos(local) && local < policy
    ? { maxRiskBRL: local, source: 'EA localLimits.maxRiskBRL' }
    : { maxRiskBRL: policy, source: 'policy.max_risk_brl' };
}
export function config(env: BridgeEnv) {
  const maxContracts = Number(env.TRADE_MAX_CONTRACTS ?? 1);
  const maxAgeMs = Number(env.TRADE_FEED_MAX_AGE_MS ?? 15000);
  if (
    !Number.isInteger(maxContracts) ||
    maxContracts < 1 ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs < 1000 ||
    maxAgeMs > 60000
  )
    throw new Error('Limites do bridge inválidos');
  return {
    symbol: env.TRADE_MT5_SYMBOL || 'WINV26',
    bridgeId: env.TRADE_BRIDGE_ID || 'xp-mt5-primary',
    maxContracts,
    maxAgeMs,
    execution: env.TRADE_EXECUTION_ENABLED === 'true',
    accountHash: env.TRADE_ACCOUNT_HASH || '',
  };
}
export class PersistenceError extends Error {
  constructor(
    readonly code:
      | 'CONFIGURATION_MISSING'
      | 'SCHEMA_MISSING'
      | 'ACCESS_DENIED'
      | 'PERSISTENCE_UNAVAILABLE'
      | 'BRIDGE_SESSION_LEASE_CONFLICT',
    readonly operation: string,
    readonly httpStatus?: number,
    readonly databaseCode?: string,
  ) {
    super(
      {
        CONFIGURATION_MISSING:
          'Variáveis TRADE_SUPABASE_URL/TRADE_SUPABASE_SERVICE_KEY ausentes ou inválidas.',
        SCHEMA_MISSING:
          'Estrutura/RPC Trade ausente ou desatualizada. Verifique as migrations do módulo.',
        ACCESS_DENIED:
          'A credencial do backend não tem acesso à persistência Trade. Verifique a chave service role.',
        BRIDGE_SESSION_LEASE_CONFLICT:
          'Outra sessão EA mantém a reserva deste bridge. Preserve o pending e aguarde a reserva expirar.',
        PERSISTENCE_UNAVAILABLE:
          'Não foi possível acessar a persistência Trade. Tente novamente.',
      }[code],
    );
  }
}
export function persistenceFailure(error: unknown) {
  return error instanceof PersistenceError
    ? {
        error: error.message,
        code: error.code,
        operation: error.operation,
        httpStatus: error.httpStatus,
      }
    : {
        error:
          'Falha ao carregar operações. Verifique o diagnóstico de persistência.',
        code: 'OPERATIONS_UNAVAILABLE',
      };
}
export function runtimeConfiguration(env: BridgeEnv) {
  return {
    urlPresent: !!env.TRADE_SUPABASE_URL,
    serviceKeyPresent: !!env.TRADE_SUPABASE_SERVICE_KEY,
    bridgeTokenPresent: !!env.TRADE_BRIDGE_TOKEN,
    executionExplicitlyDisabled: env.TRADE_EXECUTION_ENABLED === 'false',
    executionEnabled: config(env).execution,
  };
}
export async function rpc(
  env: BridgeEnv,
  name: string,
  args: unknown,
): Promise<any> {
  if (!env.TRADE_SUPABASE_URL || !env.TRADE_SUPABASE_SERVICE_KEY)
    throw new PersistenceError('CONFIGURATION_MISSING', name);
  let url: URL;
  try {
    url = new URL(env.TRADE_SUPABASE_URL);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search
    )
      throw new Error();
  } catch {
    throw new PersistenceError('CONFIGURATION_MISSING', name);
  }
  let response: Response;
  try {
    response = await fetch(`${url.origin}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: env.TRADE_SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.TRADE_SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new PersistenceError('PERSISTENCE_UNAVAILABLE', name);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if(name.startsWith('trade_inspection_') && data?.code==='P0001' && ['Inspection proposal invalid','Inspection nonce already consumed','Inspection confirmation invalid or expired'].includes(data?.message))
      throw new Error('Confirmação de inspeção inválida, reutilizada ou expirada. Gere uma nova proposta.');
    // Deliberate REAL-session/configuration refusals carry a safe, explicit code for the operator.
    if(data?.code==='P0001' && typeof data?.message==='string' && /^(ARM_BLOCKED|POLICY_|AUTHORIZATION_|Kill switch is released|RISK_SETTINGS_INVALID|QUANTITY_)/.test(data.message))
      throw new Error(data.message.slice(0,300));
    const code =
      data?.code === 'P0001' && data?.message === 'Another EA session owns the lease'
        ? 'BRIDGE_SESSION_LEASE_CONFLICT'
        : response.status === 401 ||
      response.status === 403 ||
      data?.code === '42501'
        ? 'ACCESS_DENIED'
        : response.status === 404 ||
            ['PGRST202', 'PGRST205', '42P01', '42883'].includes(data?.code)
          ? 'SCHEMA_MISSING'
          : 'PERSISTENCE_UNAVAILABLE';
    throw new PersistenceError(
      code,
      name,
      response.status,
      typeof data?.code === 'string' &&
      /^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/.test(data.code)
        ? data.code
        : undefined,
    );
  }
  // Functions returning void answer 204 / an empty body (PostgREST). That is success, not a failure:
  // treating it as an error aborted every caller after the first void call (LAB outcome tracking).
  try {
    const text = await response.text();
    return text.trim() ? JSON.parse(text) : null;
  } catch {
    throw new PersistenceError(
      'PERSISTENCE_UNAVAILABLE',
      name,
      response.status,
    );
  }
}
export async function authenticateBridge(request: Request, env: BridgeEnv) {
  if (!env.TRADE_BRIDGE_TOKEN || env.TRADE_BRIDGE_TOKEN.length < 32)
    return false;
  const supplied = request.headers.get('Authorization') || '';
  const hash = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    );
  const [a, b] = await Promise.all([
    hash(supplied),
    hash(`Bearer ${env.TRADE_BRIDGE_TOKEN}`),
  ]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
