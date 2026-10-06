import { config, rpc, type BridgeEnv } from '../bridge/config';
import { paperRiskStatus, paperRiskPolicy, riskSnapshot } from '../bridge/risk-settings';
import { MT5MarketDataProvider, feedStatus } from '../bridge/mt5';
import {
  generateMockCandles,
  snapshotOf,
  CandleAggregator,
} from '../core/providers';
import { scanMarket, advanceWatches } from './engine';
import {
  buildTechnicalProposal,
  sizeProposal,
  type Proposal,
} from '../bridge/approval';
import { scannerParameters } from './strategies';
import { instrumentValue } from '../bridge/instruments';
import type { SetupWatch, ScannerResult } from './types';
import { buildSetupSnapshot, observationId } from '../lab/snapshot';
import { assessActionability } from '../lab/actionability';
import { trackOutcome, resolveWithTicks } from '../lab/outcome';
export const tradeOwner = 'focoos-admin';
export function scannerScope(source: string, symbol: string, run = 'default') {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(run)) throw new Error('Sessão inválida');
  return `${source}:${symbol}:${run}`;
}
export async function runScanner(
  env: BridgeEnv,
  source: 'mt5' | 'replay',
  cursor: number,
  run = 'default',
) {
  if (source !== 'mt5' && source !== 'replay')
    throw new Error('Fonte inválida');
  if (
    !Number.isInteger(cursor) ||
    cursor < 0 ||
    (source === 'replay' && cursor > 420)
  )
    throw new Error('Cursor inválido');
  const data =
      source === 'mt5' ? await new MT5MarketDataProvider(env).read() : null,
    c = config(env);
  const candles = data
    ? (data.candles || []).filter(
        (b: any) =>
          b.symbol === c.symbol && b.timestamp + 60 <= Date.now() / 1000,
      )
    : source === 'replay'
      ? generateMockCandles().slice(0, cursor)
      : [];
  const symbol = source === 'mt5' ? c.symbol : 'WIN',
    scope = scannerScope(source, symbol, source === 'mt5' ? c.bridgeId : run),
    snapshot = snapshotOf(candles, source === 'mt5' ? 'live' : 'replay');
  snapshot.symbol = symbol;
  snapshot.tickSize = data?.state?.tickSize || 5;
  const available =
    source === 'replay' ||
    (feedStatus(data, env).status === 'LIVE' &&
      snapshot.asOf > 0 &&
      Date.now() / 1000 - snapshot.asOf <=
        scannerParameters.closedCandleMaxAgeSeconds);
  const old = await rpc(env, 'trade_scanner_read', {
    p_owner: tradeOwner,
    p_scope: scope,
  });
  if (old.asOf > snapshot.asOf)
    throw new Error(
      'Replay voltou no tempo. Inicie uma nova sessão para preservar o histórico anterior.',
    );
  // PAPER risk = persisted, versioned risk management (1R, max contracts, daily limits). No fallback.
  const riskStatus = await paperRiskStatus(env),
    risk = paperRiskPolicy(riskStatus),
    pointValue = (() => {
      try {
        return instrumentValue(symbol, 'PAPER', data?.state).pointValue;
      } catch {
        return null;
      }
    })(),
    riskPolicy = {
      paper: risk,
      maxContracts: risk.maxContracts,
      pointValue,
      status: riskStatus,
    };
  /**
   * Confirmed setup → technical proposal → central Risk Engine. A setup whose single contract
   * exceeds the limit is persisted as RISK_BLOCKED (quantity 0) for hypothetical study; it is
   * never sent to the PAPER provider and never becomes an order. Idempotent per watch.
   */
  // Current quote: XP tick (normalized UTC) live; replay has no book, so the last close stands in.
  const lastClose = candles.at(-1)?.close,
    quote =
      source === 'mt5'
        ? data?.tick
          ? { bid: data.tick.bid, ask: data.tick.ask, last: data.tick.last, timeMsc: data.tick.timeMsc }
          : null
        : lastClose
          ? { bid: lastClose, ask: lastClose, last: lastClose }
          : null;
  /**
   * LAB: every confirmed setup is recorded once (dedup by watch) with an immutable snapshot, before
   * and independently of any proposal. A setup whose price already moved away is MISSED, never chased.
   */
  const observe = async (w: SetupWatch, scan: ScannerResult, at: typeof quote = quote) => {
    const id = observationId(scope, w.id),
      snap = buildSetupSnapshot(w, scan, { source: source === 'mt5' ? 'LIVE' : 'REPLAY', scope, quote: at, pointValue }),
      act = assessActionability({ direction: snap.direction as 'BUY' | 'SELL', entry: snap.entry, stop: snap.stop, target: snap.target }, at);
    const row = await rpc(env, 'trade_setup_observe', {
      p_owner: tradeOwner,
      p_observation: { id, scope, source: snap.source, snapshot: snap, actionability: act },
    });
    if (w.candidate.analysis.conflicts.length)
      await rpc(env, 'trade_setup_lifecycle', { p_owner: tradeOwner, p_id: id, p_state: 'CANCELLED', p_payload: { reason: 'DIRECTION_CONFLICT', conflicts: w.candidate.analysis.conflicts } });
    else if (act.status === 'MISSED' || act.status === 'INVALIDATED')
      await rpc(env, 'trade_setup_lifecycle', { p_owner: tradeOwner, p_id: id, p_state: act.status, p_payload: act });
    return { id, actionability: act, lifecycle: row?.lifecycle as string | undefined };
  };
  const propose = async (watches: SetupWatch[], scan: ScannerResult) => {
    const regimes = scan.regimes;
    const technicalProposals: {
        setupWatchId: string;
        strategy: string;
        proposal: Proposal;
        observationId?: string;
        actionability?: ReturnType<typeof assessActionability>;
      }[] = [],
      proposalBlocks: { setupWatchId: string; strategy: string; reason: string }[] = [];
    if (!available) return { technicalProposals, proposalBlocks };
    for (const w of watches) {
      if (
        !['CONFIRMED', 'PROPOSED', 'RISK_BLOCKED'].includes(w.state) ||
        w.lastAsOf !== snapshot.asOf ||
        !w.candidate.analysis.setup
      )
        continue;
      const strategy = w.candidate.definition.id;
      let obs: Awaited<ReturnType<typeof observe>> | undefined;
      try {
        obs = await observe(w, scan);
      } catch (e) {
        proposalBlocks.push({ setupWatchId: w.id, strategy, reason: 'LAB: ' + (e instanceof Error ? e.message.slice(0, 200) : 'observação indisponível') });
      }
      if (w.candidate.analysis.conflicts.length) continue;
      if (obs && ['MISSED', 'INVALIDATED'].includes(obs.actionability.status) && w.state === 'CONFIRMED') {
        proposalBlocks.push({ setupWatchId: w.id, strategy, reason: `${obs.actionability.status}: ${obs.actionability.reasons.join(' ')}` });
        continue;
      }
      try {
        const contract = instrumentValue(symbol, 'PAPER', data?.state),
          technical = buildTechnicalProposal(w.candidate.analysis, {
            mode: 'PAPER',
            source,
            symbol,
            cursor: source === 'mt5' ? snapshot.asOf : cursor,
            asOf: snapshot.asOf,
            liveAuthorized: false,
          }),
          p = sizeProposal(technical, {
            pointValue: contract.pointValue,
            currency: contract.currency,
            pointValueSource: contract.source,
            maxContracts: risk.maxContracts,
            maxRiskBRL: risk.maxRiskBRL,
            maxRiskSource: risk.source,
          });
        const saved = await rpc(env, 'trade_propose', {
          p_owner: tradeOwner,
          p_bridge: c.bridgeId,
          p_proposal: {
            ...p,
            riskSettings: riskSnapshot(riskStatus),
            scope,
            setupWatchId: w.id,
            setupObservationId: obs?.id,
            participants: w.participants,
            regimes,
          },
        });
        const proposal = (saved?.payload as Proposal) || p;
        technicalProposals.push({
          setupWatchId: w.id,
          strategy,
          proposal,
          observationId: obs?.id,
          actionability: assessActionability({ direction: proposal.direction, entry: proposal.entry, stop: proposal.sl, target: proposal.tp, expiresAt: proposal.expiresAt }, quote),
        });
      } catch (e) {
        proposalBlocks.push({
          setupWatchId: w.id,
          strategy,
          reason: e instanceof Error ? e.message.slice(0, 300) : 'Proposta indisponível',
        });
      }
    }
    return { technicalProposals, proposalBlocks };
  };
  /**
   * Outcome tracking for every open observation of this scope, traded or not. Causal (bars after
   * confirmation only); a bar touching stop and target is settled by ticks when they exist, else AMBIGUOUS.
   */
  const track = async () => {
    const session = source === 'mt5' ? { nowSeconds: Date.now() / 1000 } : undefined;
    const settle = async (rows: any[]) => {
      const items: { id: string; outcome: ReturnType<typeof trackOutcome> }[] = [];
      for (const o of rows || []) {
        // One bad row never stops the others (each is evaluated independently).
        try {
          const plan = { direction: o.direction === 'BUY' ? ('long' as const) : ('short' as const), entry: Number(o.entry), stop: Number(o.stop), target: Number(o.target), asOf: Number(o.marketAsOf) };
          let outcome = trackOutcome(plan, candles, undefined, undefined, session);
          if (outcome.status === 'AMBIGUOUS' && source === 'mt5' && outcome.exitTimestamp !== null) {
            const ticks = await rpc(env, 'trade_bridge_ticks_window', { p_bridge: c.bridgeId, p_symbol: symbol, p_from_ms: outcome.exitTimestamp * 1000, p_to_ms: outcome.exitTimestamp * 1000 + 60000 }).catch(() => []);
            const order = resolveWithTicks(ticks || [], plan);
            if (order) outcome = trackOutcome(plan, candles, () => order, undefined, session);
          }
          if (outcome.barsTracked === 0 && outcome.status === 'OPEN') continue;
          if (JSON.stringify(outcome) === JSON.stringify(o.outcome)) continue;
          items.push({ id: o.id, outcome });
        } catch {
          /* skipped this round; retried on the next scanner run */
        }
      }
      return items;
    };
    // Setup observations (LAB) and, for proposals that never had an observation (created before the
    // LAB existed), the proposal's own levels. Both written in one batch call each.
    const open: any[] = await rpc(env, 'trade_setup_open', { p_owner: tradeOwner, p_scope: scope, p_limit: 200 });
    const items = await settle(open);
    let updated = items.length ? Number(await rpc(env, 'trade_setup_outcomes_batch', { p_owner: tradeOwner, p_items: items })) || 0 : 0;
    const records: any[] = await rpc(env, 'trade_proposal_records_open', { p_owner: tradeOwner, p_scope: scope, p_limit: 200 }).catch(() => []);
    const recordItems = await settle(records);
    if (recordItems.length) updated += Number(await rpc(env, 'trade_proposal_record_outcomes_batch', { p_owner: tradeOwner, p_items: recordItems })) || 0;
    return updated;
  };
  if (old.asOf === snapshot.asOf) {
    const scan = scanMarket(snapshot, undefined, available);
    return {
      ...old,
      scan,
      feedLive: available,
      scope,
      riskPolicy,
      ...(await propose(old.watches || [], scan)),
      outcomesUpdated: await track().catch(() => 0),
    };
  }
  let watches: SetupWatch[] = old.watches || [],
    scan: ScannerResult = scanMarket(snapshot, undefined, available);
  const evaluations: any[] = [];
  // Setups confirmed on an intermediate candle of a catch-up batch (scanner not polled at that
  // minute). Recorded in the LAB at their own confirmation candle so no confirmed setup is lost.
  const catchUp: { watch: SetupWatch; scan: ScannerResult }[] = [];
  const agg = new CandleAggregator();
  for (const candle of candles) {
    const s = agg.next(candle, source === 'mt5' ? 'live' : 'replay');
    s.tickSize = snapshot.tickSize;
    if (s.asOf <= (old.asOf || 0)) continue;
    // First attachment to a live bridge starts at latest candle, never retro-proposes old signals.
    if (source === 'mt5' && !old.asOf && s.asOf !== snapshot.asOf) continue;
    scan = scanMarket(s, undefined, available);
    evaluations.push({
      asOf: s.asOf,
      candidates: scan.candidates.map((c) => ({
        id: c.definition.id,
        version: c.definition.version,
        state: c.state,
        reasons: c.reasons,
        conditions: c.analysis.conditions,
        regimes: c.regime,
      })),
    });
    watches = advanceWatches(watches, scan);
    if (available && s.asOf !== snapshot.asOf)
      for (const w of watches)
        if (w.state === 'CONFIRMED' && w.lastAsOf === s.asOf && w.candidate.analysis.setup && !catchUp.some((x) => x.watch.id === w.id))
          catchUp.push({ watch: structuredClone(w), scan });
  }
  const saved = await rpc(env, 'trade_scanner_save', {
    p_owner: tradeOwner,
    p_scope: scope,
    p_expected: old.asOf || 0,
    p_payload: {
      asOf: snapshot.asOf,
      scope,
      scan,
      watches,
      evaluations,
      feedLive: available,
    },
  });
  // A catch-up confirmation is observed with no quote (the book at that minute is unknown, never
  // invented). If it is no longer confirmed on the latest candle it was never presentable: MISSED.
  for (const { watch, scan: at } of catchUp) {
    if (!(saved.watches || []).some((w: SetupWatch) => w.id === watch.id)) continue;
    try {
      const obs = await observe(watch, at, null),
        now = (saved.watches || []).find((w: SetupWatch) => w.id === watch.id);
      if (!watch.candidate.analysis.conflicts.length && !(now && ['CONFIRMED', 'PROPOSED', 'RISK_BLOCKED'].includes(now.state) && now.lastAsOf === snapshot.asOf))
        await rpc(env, 'trade_setup_lifecycle', {
          p_owner: tradeOwner,
          p_id: obs.id,
          p_state: 'MISSED',
          p_payload: { ...obs.actionability, status: 'MISSED', reasons: ['Confirmado durante recuperação de candles; não estava mais válido no candle atual e nunca foi apresentado como proposta.'] },
        });
    } catch {
      // Best effort, not retried: the watch history still keeps the confirmation.
    }
  }
  const proposals = await propose(saved.watches || [], scan);
  const outcomesUpdated = await track().catch(() => 0);
  return {
    ...(await rpc(env, 'trade_scanner_read', {
      p_owner: tradeOwner,
      p_scope: scope,
    })),
    feedLive: available,
    scope,
    riskPolicy,
    ...proposals,
    outcomesUpdated,
  };
}
