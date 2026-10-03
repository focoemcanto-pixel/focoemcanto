'use client';
import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type AutoscaleInfo,
} from 'lightweight-charts';
import type { Analysis, Candle, Timeframe } from '../../trade/core/types';
const timeLabel = (t: number) =>
  new Date(t * 1000).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
export default function Chart({
  candles,
  analysis,
  timeframe,
  hideAnalysis,
  trendPoints,
}: {
  candles: Candle[];
  analysis?: Analysis;
  timeframe: Timeframe;
  hideAnalysis: boolean;
  trendPoints: { timestamp: number; value: number }[];
}) {
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<IChartApi>(),
    price = useRef<ISeriesApi<'Candlestick'>>(),
    volume = useRef<ISeriesApi<'Histogram'>>(),
    trend = useRef<ISeriesApi<'Line'>>();
  const previousTf = useRef(timeframe);
  const lines = useRef<any[]>([]);
  useEffect(() => {
    if (!host.current) return;
    const c = createChart(host.current, {
      autoSize: true,
      height: 480,
      layout: {
        background: { type: ColorType.Solid, color: '#0c111b' },
        textColor: '#798599',
        fontFamily: 'Arial',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#18202e' },
        horzLines: { color: '#18202e' },
      },
      crosshair: {
        vertLine: { color: '#6c798e', labelBackgroundColor: '#29364c' },
        horzLine: { color: '#6c798e', labelBackgroundColor: '#29364c' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#263041',
        tickMarkFormatter: (t: any) => timeLabel(Number(t)),
      },
      rightPriceScale: {
        borderColor: '#263041',
        scaleMargins: { top: 0.12, bottom: 0.23 },
      },
      localization: {
        timeFormatter: (t: any) => timeLabel(Number(t)),
        priceFormatter: (v: number) =>
          v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }),
      },
    });
    chart.current = c;
    price.current = c.addSeries(CandlestickSeries, {
      upColor: '#58c8aa',
      downColor: '#e57983',
      borderVisible: false,
      wickUpColor: '#58c8aa',
      wickDownColor: '#e57983',
    });
    volume.current = c.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    c.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
      visible: false,
    });
    trend.current = c.addSeries(LineSeries, {
      color: '#b89c71',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    return () => {
      c.remove();
      chart.current = undefined;
      price.current = undefined;
      volume.current = undefined;
      trend.current = undefined;
    };
  }, []);
  useEffect(() => {
    if (!price.current || !volume.current || !chart.current) return;
    price.current.setData(
      candles.map((c) => ({
        time: c.timestamp as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    volume.current.setData(
      candles.map((c) => ({
        time: c.timestamp as Time,
        value: c.volume,
        color: c.close >= c.open ? '#265246' : '#583a45',
      }))
    );
    const changed = previousTf.current !== timeframe;
    previousTf.current = timeframe;
    if (changed || !chart.current.timeScale().getVisibleLogicalRange())
      chart.current.timeScale().fitContent();
    if (!hideAnalysis && candles.length > 1)
      trend.current?.setData(
        trendPoints.map((p) => ({ time: p.timestamp as Time, value: p.value }))
      );
    else trend.current?.setData([]);
    lines.current.forEach((l) => price.current?.removePriceLine(l));
    lines.current = [];
    price.current.applyOptions({
      autoscaleInfoProvider: (base: () => AutoscaleInfo | null) => {
        const info = base();
        if (info?.priceRange && !hideAnalysis && analysis?.setup) {
          info.priceRange.minValue = Math.min(
            info.priceRange.minValue,
            analysis.setup.stop,
            ...analysis.setup.targets
          );
          info.priceRange.maxValue = Math.max(
            info.priceRange.maxValue,
            analysis.setup.stop,
            ...analysis.setup.targets
          );
        }
        return info;
      },
    });
    if (hideAnalysis || !analysis) return;
    const levels = [
      { value: analysis.support, color: '#609d91', title: 'Suporte 5m' },
      { value: analysis.resistance, color: '#ba7d84', title: 'Resistência 5m' },
      {
        value: analysis.region?.[0],
        color: '#756342',
        title: 'Região · limite inferior',
      },
      {
        value: analysis.region?.[1],
        color: '#756342',
        title: 'Região · limite superior',
      },
      { value: analysis.setup?.entry, color: '#8fb3ed', title: 'Referência' },
      { value: analysis.setup?.stop, color: '#e57983', title: 'Invalidação' },
      { value: analysis.setup?.targets[0], color: '#58c8aa', title: 'Alvo' },
    ];
    levels.forEach((l) => {
      if (l.value !== undefined)
        lines.current.push(
          price.current!.createPriceLine({
            price: l.value,
            color: l.color,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: l.title,
          })
        );
    });
  }, [candles, analysis, timeframe, hideAnalysis, trendPoints]);
  return (
    <div
      className="trade-chart"
      ref={host}
      aria-label={`Gráfico candlestick WIN ${timeframe}`}
    />
  );
}
