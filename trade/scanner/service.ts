import { config, rpc, paperRiskLimit, type BridgeEnv } from '../bridge/config';
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
  const risk = paperRiskLimit(env),
    pointValue = (() => {
      try {
        return instrumentValue(symbol, 'PAPER', data?.state).pointValue;
      } catch {
        return null;
      }
    })(),
    riskPolicy = {
      paper: risk,
      maxContracts: c.maxContracts,
      pointValue,
    };
  /**
   * Confirmed setup → technical proposal → central Risk Engine. A setup whose single contract
   * exceeds the limit is persisted as RISK_BLOCKED (quantity 0) for hypothetical study; it is
   * never sent to the PAPER provider and never becomes an order. Idempotent per watch.
   */
  const propose = async (watches: SetupWatch[], regimes: string[]) => {
    const technicalProposals: {
        setupWatchId: string;
        strategy: string;
        proposal: Proposal;
      }[] = [],
      proposalBlocks: { setupWatchId: string; strategy: string; reason: string }[] = [];
    if (!available) return { technicalProposals, proposalBlocks };
    for (const w of watches) {
      if (
        !['CONFIRMED', 'PROPOSED', 'RISK_BLOCKED'].includes(w.state) ||
        w.lastAsOf !== snapshot.asOf ||
        w.candidate.analysis.conflicts.length ||
        !w.candidate.analysis.setup
      )
        continue;
      const strategy = w.candidate.definition.id;
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
            maxContracts: c.maxContracts,
            maxRiskBRL: risk.maxRiskBRL,
            maxRiskSource: risk.source,
          });
        const saved = await rpc(env, 'trade_propose', {
          p_owner: tradeOwner,
          p_bridge: c.bridgeId,
          p_proposal: {
            ...p,
            scope,
            setupWatchId: w.id,
            participants: w.participants,
            regimes,
          },
        });
        technicalProposals.push({
          setupWatchId: w.id,
          strategy,
          proposal: (saved?.payload as Proposal) || p,
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
  if (old.asOf === snapshot.asOf) {
    const scan = scanMarket(snapshot, undefined, available);
    return {
      ...old,
      scan,
      feedLive: available,
      scope,
      riskPolicy,
      ...(await propose(old.watches || [], scan.regimes)),
    };
  }
  let watches: SetupWatch[] = old.watches || [],
    scan: ScannerResult = scanMarket(snapshot, undefined, available);
  const evaluations: any[] = [];
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
  const proposals = await propose(saved.watches || [], scan.regimes);
  return {
    ...(await rpc(env, 'trade_scanner_read', {
      p_owner: tradeOwner,
      p_scope: scope,
    })),
    feedLive: available,
    scope,
    riskPolicy,
    ...proposals,
  };
}
