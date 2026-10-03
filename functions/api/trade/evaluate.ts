import { config, type BridgeEnv } from '../../../trade/bridge/config';
import { MT5MarketDataProvider, feedStatus } from '../../../trade/bridge/mt5';
import { snapshotOf } from '../../../trade/core/providers';
import { evaluateSnapshot, metrics } from '../../../trade/core/engine';
import {
  TrendPullbackConfirmation,
  ema,
  pullbackParameters,
} from '../../../trade/core/strategy';
import { generateMockCandles } from '../../../trade/core/providers';
import { runReplay } from '../../../trade/core/engine';
export async function onRequestGet({
  request,
  env = {},
}: {
  request: Request;
  env?: BridgeEnv;
}) {
  const url = new URL(request.url);
  if (url.searchParams.get('source') === 'mt5') {
    try {
      const c = config(env),
        data = await new MT5MarketDataProvider(env).read();
      const feed = feedStatus(data, env);
      const visible = (data?.candles || []).filter(
        (bar: any) =>
          bar.symbol === c.symbol && bar.timestamp + 60 <= Date.now() / 1000,
      );
      const snapshot = snapshotOf(visible, 'live');
      snapshot.symbol = c.symbol;
      snapshot.tickSize = data?.state?.tickSize || 5;
      const analyses = evaluateSnapshot(snapshot, [
        new TrendPullbackConfirmation(),
      ]);
      if (feed.status !== 'LIVE')
        analyses.forEach((a) => {
          a.status = 'blocked';
          a.setup = undefined;
          a.explanation = 'Feed offline ou antigo. Aguarde dados atuais.';
        });
      const trendLines = Object.fromEntries(
        Object.entries(snapshot.candles).map(([tf, cs]) => {
          const values = ema(
            cs.map((c) => c.close),
            pullbackParameters.contextFastPeriod,
          );
          return [
            tf,
            cs.map((bar, i) => ({
              timestamp: bar.timestamp,
              value: values[i],
            })),
          ];
        }),
      );
      return Response.json({
        source: 'live',
        cursor: visible.length,
        total: visible.length,
        marketStatus: `XP / MetaTrader 5 • ${feed.status}`,
        snapshot,
        analyses,
        signals: [],
        trades: [],
        metrics: metrics([]),
        parameters: pullbackParameters,
        trendLines,
        feed,
      });
    } catch {
      return Response.json(
        {
          error:
            'MT5 não configurado ou persistência indisponível. Replay continua disponível.',
        },
        { status: 503 },
      );
    }
  }
  const cursor = Number(url.searchParams.get('cursor') ?? 180);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > 420)
    return Response.json(
      { error: 'Cursor deve ser inteiro entre 0 e 420.' },
      { status: 400 },
    );
  return Response.json(runReplay(generateMockCandles(), cursor));
}
