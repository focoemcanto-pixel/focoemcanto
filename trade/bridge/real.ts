import { config, rpc, realRiskCap, type BridgeEnv } from './config';
import { feedStatus } from './mt5';
import { isExecutable, type Proposal } from './approval';
import { commandCanonical, type BrokerCommand } from './protocol';
import { policyComparison, transportHealth } from './operational-policy';
export type GateScope = 'static' | 'session' | 'operation';
/**
 * What a failing gate needs. TECHNICAL: configuration/infrastructure that can be fixed without any risk
 * decision. DECISION: a choice only the operator can make (limits, policy approval, strategy, rollover).
 * SESSION: deliberate per-session human controls (arm, kill switch). OPERATION: checked per order.
 * Classification is display only: a gate's ok value never depends on it.
 */
export type GateKind = 'TECHNICAL' | 'DECISION' | 'SESSION' | 'OPERATION';
export type GateCheck = { label: string; ok: boolean; kind: 'TECHNICAL' | 'DECISION'; action: string };
export type RealGate = {
  key: string;
  label: string;
  ok: boolean;
  reason: string;
  /** static: configured once · session: armed/disarmed from the UI · operation: every order. */
  scope: GateScope;
  kind: GateKind;
  /** Concrete next step for a failing gate (where and what), never a secret value. */
  action: string;
  checks?: GateCheck[];
};
const decisionGates = new Set(['cap', 'policy', 'authorization', 'limits', 'rollover', 'daily', 'frequency', 'exposure']);
const sessionControls = new Set(['armed', 'kill']);
/** Gates that are configuration, set once (backend env, policy, authorization, EA inputs). */
const staticGates = new Set(['cap','backend','policy','authorization','account','protocol','symbol','expiration','rollover','limits','local','metadata','exposure']);
/** Gates evaluated per order on a concrete proposal. */
const operationGates = new Set(['inspection','sizing','notional','quantity','prices','risk','proposal']);
const scopeOf = (key: string): GateScope =>
  staticGates.has(key) ? 'static' : operationGates.has(key) ? 'operation' : 'session';
/** Gates the arming step can't satisfy beforehand: arming itself releases the kill switch. */
const armingExcluded = new Set(['armed', 'kill']);
/** Financial limits, calendar and rollover are explicit policy, never guesses. */
export function realReadiness(
  ctx: any,
  env: BridgeEnv,
  p?: Proposal,
  now = Date.now(),
) {
  const c = config(env),
    b = ctx?.bridge,
    s = b?.state || {},
    policy = ctx?.policy || {},
    feed = feedStatus(b, env, now),
    local = s.localLimits || {};
  const operationalPolicy = policyComparison(ctx, env, now), connection = transportHealth(b, c.maxAgeMs, now);
  const gates: RealGate[] = [];
  const add = (key: string, label: string, ok: unknown, reason: string, checks?: GateCheck[]) => {
    const scope = scopeOf(key),
      failing = (checks || []).filter((x) => !x.ok),
      kind: GateKind =
        scope === 'operation'
          ? 'OPERATION'
          : sessionControls.has(key)
            ? 'SESSION'
            : failing.some((x) => x.kind === 'TECHNICAL')
              ? 'TECHNICAL'
              : failing.length || decisionGates.has(key)
                ? 'DECISION'
                : 'TECHNICAL';
    gates.push({ key, label, ok: ok === true, reason, scope, kind, action: failing[0]?.action || reason, ...(checks ? { checks } : {}) });
  };
  const check = (label: string, ok: unknown, kind: GateCheck['kind'], action: string): GateCheck => ({ label, ok: ok === true, kind, action });
  const accountConfigured = /^[a-f0-9]{64}$/.test(c.accountHash);
  // EA v2.07+ reports every component of its local execution gate; v2.06 only the combined result.
  const eg = s.executionGate,
    eaChecks: GateCheck[] = eg
      ? [
          check('EnableExecution=true nas entradas do EA', eg.input, 'TECHNICAL', 'MT5 → propriedades do EA → Entradas: EnableExecution=true.'),
          check('Botão Algo Trading do terminal ligado', eg.terminalAlgoTrading, 'TECHNICAL', 'MT5 → barra de ferramentas: ligue o botão Algo Trading (verde).'),
          check("'Permitir Algo Trading' no EA", eg.eaAlgoTrading, 'TECHNICAL', "MT5 → propriedades do EA → Comum: marque 'Permitir Algo Trading'."),
          check('Conta com negociação permitida', eg.accountTradeAllowed, 'TECHNICAL', 'A conta não permite negociar agora (investidor/somente leitura ou bloqueio da corretora): verifique com a XP.'),
          check('Corretora permite Expert Advisor na conta', eg.accountExpertAllowed, 'TECHNICAL', 'A XP não permite negociação por EA nesta conta: habilite com a corretora.'),
        ]
      : [
          check(
            'Permissões de execução do MT5',
            s.executionAllowed,
            'TECHNICAL',
            "O EA reporta executionAllowed=false. EnableExecution=true não basta: confira o botão Algo Trading do terminal, 'Permitir Algo Trading' nas propriedades do EA e se a conta permite EA. Instale o EA v2.07 para ver qual item falta.",
          ),
        ];
  const pos = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0;
  const recent = (v: unknown) =>
    typeof v === 'string' &&
    Number.isFinite(Date.parse(v)) &&
    now - Date.parse(v) >= -2000 &&
    now - Date.parse(v) <= c.maxAgeMs;
  const authorized = (a: any) =>
    a?.live_authorized === true && a?.stage === 'live-monitoring';
  const auth = p
    ? (ctx?.authorizations || []).find(
        (a: any) =>
          a.strategy_id === p.setup.strategy && a.version === p.setup.version,
      )
    : (ctx?.authorizations || []).find(authorized);
  add(
    'backend',
    'Execução backend',
    c.execution,
    'TRADE_EXECUTION_ENABLED permanece false até ativação deliberada.',
    [
      check(
        'TRADE_EXECUTION_ENABLED=true no backend',
        c.execution,
        'TECHNICAL',
        'Cloudflare Pages → focoemcanto → Settings → Variables and Secrets (Production): TRADE_EXECUTION_ENABLED=true e novo deploy. Faça isso só depois do fingerprint conferir; sozinha a flag não libera ordem.',
      ),
    ],
  );
  const managed = Number.isInteger(policy.risk_settings_version) && policy.risk_settings_version > 0;
  add(
    'policy',
    'Política REAL aprovada',
    policy.enabled === true && managed,
    'Aprovação explícita da política de risco necessária.',
    [
      check('Gestão de Risco REAL configurada (capital operacional e 1R)', managed, 'DECISION', '/trade → REAL → GESTÃO DE RISCO · REAL: defina capital operacional, 1R e limites e salve. A política REAL é gerada a partir dela.'),
      check('Sessões REAL permitidas na política', policy.enabled === true, 'DECISION', 'Na GESTÃO DE RISCO · REAL marque "Permitir sessões REAL" e salve.'),
    ],
  );
  add(
    'authorization',
    'Autorização live da estratégia/versão',
    authorized(auth),
    'liveAuthorized=false; homologação e autorização por versão necessárias.',
  );
  const session = ctx?.session || null,
    armed =
      session?.active === true &&
      !session.disarmed_at &&
      Date.parse(session.expires_at) > now;
  add(
    'armed',
    'Sessão REAL armada',
    armed,
    session?.disarm_reason
      ? `Sessão desarmada (${session.disarm_reason}). Arme novamente de forma deliberada.`
      : 'Nenhuma sessão REAL armada. Use ARMAR SESSÃO REAL.',
  );
  add(
    'kill',
    'Kill switch liberado',
    b?.killSwitch === false,
    'Kill switch ativo: novas ordens reais bloqueadas.',
  );
  add(
    'ea',
    'EA execution habilitado',
    s.executionAllowed === true,
    'EnableExecution=false ou permissões MT5 bloqueadas.',
    eaChecks,
  );
  add(
    'bridge',
    'Bridge conectado',
    s.connected === true && recent(b?.receivedAt),
    'Conexão/heartbeat antigo ou indisponível.',
  );
  if (s.policyProtocol === 1) {
    add('policy-sync', 'Policy operacional sincronizada no EA', operationalPolicy.synchronization === 'SYNCED',
      `Policy v${operationalPolicy.version ?? 'ausente'} / ${operationalPolicy.hash ?? 'hash ausente'}: ${operationalPolicy.synchronization}. Aguarde o próximo heartbeat; após reiniciar o EA a policy deve ser recebida e validada novamente.`);
    add('transport', 'Transporte sem falha pendente', !(s.transport?.consecutiveFailures > 0),
      `${connection.reason} Status MT5 ${s.transport?.lastStatus ?? 'ausente'}; erro de rede ${s.transport?.lastNetworkError ?? 'ausente'}.`);
  }
  add(
    'feed',
    'Feed e preço recentes',
    feed.status === 'LIVE' &&
      pos(b?.tick?.bid) &&
      pos(b?.tick?.ask) &&
      b.tick.ask >= b.tick.bid,
    'Preço antigo ou Bid/Ask indisponível.',
  );
  add(
    'account',
    'Conta/fingerprint autorizado',
    /^[a-f0-9]{64}$/.test(c.accountHash) &&
      b?.accountHash === c.accountHash &&
      s.accountTradeMode === 2 && policy.account_trade_mode === 2 &&
      policy.account_hash === c.accountHash,
    'Conta autorizada não configurada ou divergente.',
    [
      check(
        'TRADE_ACCOUNT_HASH configurado no backend',
        accountConfigured,
        'TECHNICAL',
        'Copie o fingerprint impresso pelo EA v2.07 na aba Experts ("account fingerprint") para Cloudflare Pages → Variables (Production): TRADE_ACCOUNT_HASH. Nunca use o número da conta.',
      ),
      check('Fingerprint do EA = backend', accountConfigured && b?.accountHash === c.accountHash, 'TECHNICAL', 'TRADE_ACCOUNT_HASH diverge do fingerprint que este EA envia: copie novamente do log do EA.'),
      check('Conta REAL (não demo)', s.accountTradeMode === 2, 'TECHNICAL', 'O MT5 não reporta conta REAL.'),
      check('Política REAL vinculada a esta conta', policy.account_hash === c.accountHash && policy.account_trade_mode === 2, 'DECISION', 'Salve a política REAL (conta, símbolo e contrato são preenchidos pelo servidor).'),
    ],
  );
  add(
    'protocol',
    'Pipeline assinado v2 disponível',
    s.protocolVersion === 2 &&
      s.magic === '706032601' &&
      !!env.TRADE_BRIDGE_TOKEN &&
      env.TRADE_BRIDGE_TOKEN.length >= 32,
    'Compile/instale o EA v2 e confira o Magic Number.',
  );
  add(
    'symbol',
    'Símbolo autorizado',
    b?.bridgeId === c.bridgeId && b?.symbol === c.symbol && policy.symbol === c.symbol && (!p || p.symbol === c.symbol),
    'Símbolo da proposta/política/bridge divergente.',
    [
      check('Bridge e símbolo do EA = backend', b?.bridgeId === c.bridgeId && b?.symbol === c.symbol, 'TECHNICAL', 'BridgeId/TradeSymbol do EA divergem de TRADE_BRIDGE_ID/TRADE_MT5_SYMBOL.'),
      check('Símbolo gravado na política', policy.symbol === c.symbol, 'DECISION', 'Salve a política REAL: o símbolo vem do servidor.'),
    ],
  );
  add(
    'expiration',
    'Contrato vigente',
    typeof policy.contract_expires_at === 'string' &&
      Date.parse(policy.contract_expires_at) > now &&
      pos(s.expirationTime) &&
      s.expirationTime * 1000 > now,
    'Vencimento confirmado e metadado de expiração do MT5 necessários.',
    [
      check('Vencimento informado pelo MT5 no futuro', pos(s.expirationTime) && s.expirationTime * 1000 > now, 'TECHNICAL', 'O MT5 não informa vencimento futuro para este símbolo: contrato vencido ou rollover necessário.'),
      check('Vencimento gravado na política', typeof policy.contract_expires_at === 'string' && Date.parse(policy.contract_expires_at) > now, 'DECISION', 'Salve a política REAL: o vencimento é copiado do MT5 pelo servidor.'),
    ],
  );
  add(
    'rollover',
    'Rollover validado',
    policy.rollover_confirmed === true && policy.symbol === c.symbol,
    'Rollover precisa de validação explícita para este contrato.',
  );
  add(
    'session',
    'Mercado/sessão autorizados',
    Array.isArray(policy.session_windows) &&
      (policy.session_windows.length === 0 ||
        policy.session_windows.some(
          (w: any) => Date.parse(w.open) <= now && Date.parse(w.close) > now,
        )) &&
      s.sessionOpen === true &&
      s.tradeMode === 4,
    'Pregão fechado no MT5, símbolo sem negociação plena ou fora de janela datada da policy.',
  );
  add(
    'limits',
    'Limites de risco configurados',
    pos(policy.max_risk_brl) &&
      pos(policy.max_daily_loss_brl) &&
      pos(policy.max_slippage_points) &&
      Number.isInteger(policy.max_contracts) &&
      policy.max_contracts >= 1 &&
      Number.isInteger(policy.max_positions) &&
      policy.max_positions >= 1,
    'Defina limites financeiros, de posições, contratos e desvio.',
    [
      check('Risco máximo por operação (R$)', pos(policy.max_risk_brl), 'DECISION', 'Você decide: risco máximo por operação na política REAL.'),
      check('Perda máxima diária (R$)', pos(policy.max_daily_loss_brl), 'DECISION', 'Você decide: perda máxima diária na política REAL.'),
      check('Desvio máximo (pontos)', pos(policy.max_slippage_points), 'DECISION', 'Você decide: slippage máximo na política REAL.'),
      check('Contratos e posições máximos', Number.isInteger(policy.max_contracts) && policy.max_contracts >= 1 && Number.isInteger(policy.max_positions) && policy.max_positions >= 1, 'DECISION', 'Você decide: contratos por ordem (o servidor limita a TRADE_MAX_CONTRACTS).'),
    ],
  );
  add(
    'local',
    'Identidade e hard caps locais do EA',
    s.localAccountAuthorized === true &&
      pos(local.maxRiskBRL) &&
      pos(local.maxLossBRL) &&
      pos(local.maxSlippagePoints) &&
      Number.isInteger(local.maxContracts) &&
      local.maxContracts >= 1 &&
      Number.isInteger(local.maxPositions) &&
      local.maxPositions >= 1,
    'Fingerprint e limites locais do EA ausentes; zero mantém REAL bloqueado.',
    [
      check('ExpectedAccountFingerprint do EA confere', s.localAccountAuthorized, 'TECHNICAL', 'MT5 → propriedades do EA → Entradas: ExpectedAccountFingerprint = fingerprint impresso pelo próprio EA (aba Experts).'),
      check('MaxContracts e MaxPositions do EA', Number.isInteger(local.maxContracts) && local.maxContracts >= 1 && Number.isInteger(local.maxPositions) && local.maxPositions >= 1, 'TECHNICAL', 'Entradas do EA: MaxContracts e MaxPositions ≥ 1.'),
      check('Hard cap MaxRiskBRL', pos(local.maxRiskBRL), 'DECISION', `MT5 → Entradas: teto MaxRiskBRL atual ${local.maxRiskBRL ?? 'ausente'}; deve ser positivo. Provisionamento inicial; a policy operacional é configurada no app, limitada por este teto.`),
      check('Hard cap MaxLoss24hBRL', pos(local.maxLossBRL), 'DECISION', `MT5 → Entradas: teto MaxLoss24hBRL atual ${local.maxLossBRL ?? 'ausente'}; deve ser positivo. Limite efetivo = menor entre policy e teto.`),
      check('Hard cap MaxSlippagePoints', pos(local.maxSlippagePoints), 'DECISION', `MT5 → Entradas: teto MaxSlippagePoints atual ${local.maxSlippagePoints ?? 'ausente'}; deve ser positivo. Não precisa espelhar a policy.`),
    ],
  );
  const cap = realRiskCap(env),
    capOk = cap === null || (cap > 0 && pos(policy.max_risk_brl) && policy.max_risk_brl <= cap);
  add('cap', 'Teto administrativo de risco', capOk, cap === 0 ? 'TRADE_REAL_MAX_RISK_BRL inválido: REAL bloqueado.' : '1R da política acima do teto administrativo TRADE_REAL_MAX_RISK_BRL.');
  const meta =
    s.currency === 'BRL' &&
    [0,1,2].includes(s.marginMode) &&
    pos(s.tickSize) &&
    pos(s.tickValue) &&
    pos(s.volumeMin) &&
    pos(s.volumeStep) &&
    pos(s.volumeMax) &&
    pos(s.point) &&
    Number.isFinite(s.stopsLevel) &&
    s.stopsLevel >= 0;
  add(
    'metadata',
    'Metadados de lote/SL/TP',
    meta,
    'Valor monetário, volume ou distância mínima incompletos.',
  );
  add(
    'reconciliation',
    'Histórico/posições reconciliados',
    s.historyReady === true &&
      recent(b?.receivedAt) &&
      pos(s.historyAsOfMsc) &&
      now - s.historyAsOfMsc >= -2000 &&
      now - s.historyAsOfMsc <= c.maxAgeMs &&
      s.protectionFault !== true,
    'Histórico incompleto ou falha de proteção.',
  );
  add(
    'unresolved',
    'Sem comando indeterminado',
    ctx?.unresolved === 0,
    'Comando pendente/indeterminado. Reconcilie; não reenvie.',
  );
  const price = p ? (p.direction === 'BUY' ? b?.tick?.ask : b?.tick?.bid) : 0,
    sign = p?.direction === 'SELL' ? -1 : 1;
  const risk = p ? sign * (price - p.sl) : 0,
    reward = p ? sign * (p.tp - price) : 0,
    value = meta ? s.tickValue / s.tickSize : 0;
  const budget =
    meta && p
      ? Math.max(p.riskBRL, risk * value * p.quantity)
      : p?.riskBRL || 0;
  add(
    'daily',
    'Perda máxima e reserva de risco',
    Number.isFinite(s.loss24hBRL) &&
      s.loss24hBRL >= 0 &&
      pos(policy.max_daily_loss_brl) &&
      pos(local.maxLossBRL) &&
      s.loss24hBRL + budget <
        Math.min(policy.max_daily_loss_brl, local.maxLossBRL),
    `Perda 24h ${Number.isFinite(s.loss24hBRL) ? s.loss24hBRL : 'indisponível'} + reserva ${budget}; policy ${policy.max_daily_loss_brl ?? 'ausente'}; hard cap EA ${local.maxLossBRL ?? 'ausente'}. O total deve ficar abaixo do menor limite. Histórico ausente bloqueia; não redefina perdas para liberar o gate.`,
  );
  add(
    'positions',
    'Limite de posições/exposição',
    Array.isArray(s.positions) &&
      Array.isArray(s.orders) &&
      s.positions.length === 0 &&
      s.orders.length === 0,
    'Nova entrada exige conta sem posições/ordens para evitar netting e risco não mensurado.',
  );
  add('frequency','Limites de frequência',Number.isInteger(policy.max_orders_per_session) && policy.max_orders_per_session>0 && Number.isInteger(policy.max_orders_per_day) && policy.max_orders_per_day>0 && Number.isInteger(ctx?.ordersSession) && ctx.ordersSession<policy.max_orders_per_session && Number.isInteger(ctx?.ordersDay) && ctx.ordersDay<policy.max_orders_per_day,'Limites por sessão/dia ausentes ou atingidos.');
  add('exposure','Limites de exposição',Number.isInteger(policy.max_position_contracts) && policy.max_position_contracts>0 && pos(policy.max_notional_brl),'Defina exposição máxima em contratos e valor nocional.');
  if (p) {
    add('inspection','Proposta habilitada para execução',p.inspectionOnly !== true,'Esta proposta é somente para inspeção; nunca se transforma em ordem. Gere outra após futura autorização.');
    // RISK_BLOCKED keeps the technical levels for study; it never becomes readiness, nonce or order.
    add('sizing','Dimensionada pelo limite de risco',p.proposalState === 'READY' && isExecutable(p) && pos(policy.max_risk_brl),p.proposalState === 'RISK_BLOCKED' ? 'BLOQUEADA POR RISCO: 1 contrato excede o limite atual; quantidade permitida 0.' : 'Proposta sem dimensionamento pelo Risk Engine ou limite REAL ausente.');
    add('notional','Exposição da proposta',p.quantity<=policy.max_position_contracts && pos(price) && pos(value) && price*value*p.quantity<=policy.max_notional_brl,'Exposição excede política ou limite não configurado.');
    const aligned = (v: number) =>
      pos(s.tickSize) &&
      Math.abs(v / s.tickSize - Math.round(v / s.tickSize)) < 1e-7;
    add(
      'quantity',
      'Quantidade/lote válido',
      Number.isInteger(p.quantity) &&
        p.quantity >= s.volumeMin &&
        p.quantity <=
          Math.min(
            c.maxContracts,
            policy.max_contracts,
            local.maxContracts,
            s.volumeMax,
          ) &&
        pos(s.volumeStep) &&
        Math.abs(
          p.quantity / s.volumeStep - Math.round(p.quantity / s.volumeStep),
        ) < 1e-7,
      'Lote fora do mínimo, step ou limites.',
    );
    add(
      'prices',
      'Entrada, stop e alvo válidos',
      pos(price) &&
        pos(p.sl) &&
        pos(p.tp) &&
        risk > 0 &&
        reward > 0 &&
        risk >= s.stopsLevel * s.point &&
        reward >= s.stopsLevel * s.point &&
        aligned(p.sl) &&
        aligned(p.tp) &&
        Math.abs(price - p.entry) <=
          Math.min(policy.max_slippage_points, local.maxSlippagePoints),
      'SL/TP inválidos ou preço além do desvio autorizado.',
    );
    add(
      'risk',
      'Risco financeiro da proposta',
      meta &&
        risk * value * p.quantity <=
          Math.min(policy.max_risk_brl, local.maxRiskBRL, cap ?? Infinity) &&
        p.pointValue === value &&
        Math.abs(p.riskBRL - p.riskPoints * p.pointValue * p.quantity) < 1e-6 &&
        p.riskBRL <= Math.min(policy.max_risk_brl, local.maxRiskBRL, cap ?? Infinity),
      'Risco ou valor monetário excede limite/está divergente.',
    );
    add(
      'proposal',
      'Proposta atual em dados reais',
      p.mode === 'REAL' &&
        p.source === 'mt5' &&
        p.expiresAt > now &&
        p.asOf <= now / 1000 &&
        now / 1000 - p.asOf <= 120 &&
        p.setup.conditions.every((x) => x.met) &&
        p.setup.conflicts.length === 0,
      'Proposta antiga ou hipótese incompleta/conflitante.',
    );
  }
  const canExecute = gates.every((g) => g.ok);
  // Arming needs every static and session gate except the ones arming itself establishes.
  const armingGates = gates.filter(
    (g) => g.scope !== 'operation' && !armingExcluded.has(g.key),
  );
  const unavailable = armingGates.filter((g) => g.scope === 'static' && !g.ok);
  const canArm = !armed && armingGates.every((g) => g.ok);
  // Infrastructure (technical) vs. operator decisions: a missing risk decision is never shown as a fault.
  const pendingTechnical = armingGates.filter((g) => !g.ok && g.kind === 'TECHNICAL'),
    pendingDecisions = gates.filter((g) => !g.ok && g.kind === 'DECISION'),
    phase = armed ? 'ARMED' : pendingTechnical.length ? 'INFRA_PENDING' : pendingDecisions.length ? 'AWAITING_OPERATOR' : 'READY_DISARMED',
    item = (g: RealGate) => ({ key: g.key, label: g.label, action: g.action, checks: (g.checks || []).filter((x) => !x.ok).map((x) => ({ label: x.label, kind: x.kind, action: x.action })) });
  return {
    status: armed
      ? canExecute
        ? 'REAL ARMADO · PRONTO PARA CONFIRMAÇÃO'
        : 'REAL ARMADO'
      : pendingTechnical.length
        ? 'REAL INDISPONÍVEL · INFRAESTRUTURA PENDENTE'
        : pendingDecisions.length
          ? 'INFRAESTRUTURA PRONTA · AGUARDANDO DECISÕES DO OPERADOR'
          : unavailable.length
            ? 'REAL INDISPONÍVEL'
            : 'REAL BLOQUEADO · SESSÃO DESARMADA',
    state: armed ? 'ARMED' : unavailable.length ? 'UNAVAILABLE' : 'BLOCKED',
    phase,
    infrastructureReady: pendingTechnical.length === 0,
    pendingTechnical: pendingTechnical.map(item),
    pendingDecisions: pendingDecisions.map(item),
    armed,
    canArm,
    armingGates,
    session: session
      ? {
          id: session.id,
          armedAt: session.armed_at,
          expiresAt: session.expires_at,
          disarmedAt: session.disarmed_at,
          reason: session.disarm_reason,
          active: armed,
        }
      : null,
    overview: {
      symbol: b?.symbol ?? null,
      accountMatches:
        /^[a-f0-9]{64}$/.test(c.accountHash) &&
        b?.accountHash === c.accountHash &&
        policy.account_hash === c.accountHash,
      accountTradeMode: s.accountTradeMode ?? null,
      feedStatus: feed.status,
      feedAgeMs: feed.ageMs,
      bridgeConnected: s.connected === true && recent(b?.receivedAt),
      eaExecutionAllowed: s.executionAllowed === true,
      eaVersion: typeof s.eaVersion === 'string' ? s.eaVersion : null,
      eaExecutionGate: s.executionGate ?? null,
      accountHashConfigured: accountConfigured,
      bridgeAccountMatches: accountConfigured && b?.accountHash === c.accountHash,
      localFingerprintMatches: s.localAccountAuthorized === true,
      freeMarginBRL: Number.isFinite(s.freeMargin) ? s.freeMargin : null,
      contractExpiresAtMT5: pos(s.expirationTime) ? new Date(s.expirationTime * 1000).toISOString() : null,
      transport: s.transport ?? null,
      policyLoaded: policy.enabled === true,
      positions: Array.isArray(s.positions) ? s.positions.length : null,
      orders: Array.isArray(s.orders) ? s.orders.length : null,
      killSwitch: b?.killSwitch ?? true,
      loss24hBRL: Number.isFinite(s.loss24hBRL) ? s.loss24hBRL : null,
      authorizedStrategies: (ctx?.authorizations || [])
        .filter(authorized)
        .map((a: any) => `${a.strategy_id}@${a.version}`),
      maxSessionMinutes: policy.max_session_minutes ?? null,
    },
    canExecute,
    pipeline: 'IMPLEMENTADO',
    operationalPolicy,
    connection,
    gates,
    symbol: c.symbol,
    lastTick: feed.status === 'LIVE' ? feed.lastTick : null,
    limits: {
      maxContracts: Math.min(
        c.maxContracts,
        policy.max_contracts || c.maxContracts,
      ),
      maxRiskBRL: policy.max_risk_brl ?? null,
      riskCapBRL: cap,
      riskSettingsVersion: policy.risk_settings_version ?? null,
      maxDailyLossBRL: policy.max_daily_loss_brl ?? null,
      maxPositions: policy.max_positions ?? null,
      maxPositionContracts: policy.max_position_contracts ?? null,
      maxOrdersPerSession: policy.max_orders_per_session ?? null,
      maxOrdersPerDay: policy.max_orders_per_day ?? null,
      maxNotionalBRL: policy.max_notional_brl ?? null,
      maxSlippagePoints: policy.max_slippage_points ?? null,
    },
  };
}
/** Re-evaluates (and, on any critical change, disarms) the armed session before reading it. */
export async function realContext(env: BridgeEnv) {
  const c = config(env);
  await rpc(env, 'trade_real_session_check', {
    p_bridge: c.bridgeId,
    p_age: c.maxAgeMs,
  });
  return rpc(env, 'trade_real_context', { p_bridge: c.bridgeId });
}
export function assertReady(r: ReturnType<typeof realReadiness>) {
  if (!r.canExecute)
    throw new Error(
      'REAL BLOQUEADO: ' +
        r.gates
          .filter((g) => !g.ok)
          .map((g) => g.label)
          .join(' · '),
    );
}
export async function nonceHash(n: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(n)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function signCommand(c: BrokerCommand, env: BridgeEnv) {
  if (!env.TRADE_BRIDGE_TOKEN || env.TRADE_BRIDGE_TOKEN.length < 32)
    throw new Error('Assinatura indisponível');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.TRADE_BRIDGE_TOKEN),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(commandCanonical(c)),
  );
  return {
    ...c,
    signature: Array.from(new Uint8Array(bytes))
      .map((x) => x.toString(16).padStart(2, '0'))
      .join(''),
    signatureVersion: 2,
  };
}
