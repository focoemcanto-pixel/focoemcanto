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
export async function rpc(
  env: BridgeEnv,
  name: string,
  args: unknown,
): Promise<any> {
  if (!env.TRADE_SUPABASE_URL || !env.TRADE_SUPABASE_SERVICE_KEY)
    throw new Error('Persistência MT5 não configurada');
  const response = await fetch(
    `${env.TRADE_SUPABASE_URL}/rest/v1/rpc/${name}`,
    {
      method: 'POST',
      headers: {
        apikey: env.TRADE_SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.TRADE_SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw new Error(`Persistência indisponível (${response.status})`);
  return response.json();
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
