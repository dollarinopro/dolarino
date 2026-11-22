import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, type IChartApi, type SeriesMarker, type Time } from 'lightweight-charts';
import type { Candle } from '@dollarino/core';

export interface ChartLevels {
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  supports?: number[];
  resistances?: number[];
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface KbosChartOverlays {
  closeSeriesAlt?: IndicatorPoint[];
  openSeriesAlt?: IndicatorPoint[];
  demaAtr?: Array<{ time: number; value: number; trend: 'BULL' | 'BEAR' }>;
  almaRibbon?: {
    bands: Array<{ label: string; color: string; points: IndicatorPoint[] }>;
  };
  markers?: Array<{
    time: number;
    position: 'belowBar' | 'aboveBar';
    color: string;
    shape: 'arrowUp' | 'arrowDown';
    text: string;
  }>;
}

export interface ChartOverlays {
  ema20?: IndicatorPoint[];
  ema50?: IndicatorPoint[];
  ema200?: IndicatorPoint[];
}

export interface CustomStrategyChartOverlay {
  id?: string;
  title: string;
  language?: 'pine' | 'python' | 'visual';
  plots: Array<{ title: string; color: string; overlay: boolean; points: IndicatorPoint[] }>;
  markers: Array<{
    time: number;
    position: 'belowBar' | 'aboveBar';
    color: string;
    shape: 'arrowUp' | 'arrowDown';
    text: string;
  }>;
}

export function CandlestickChart({
  candles,
  levels,
  overlays,
  kbosOverlays,
  customOverlays,
  showVolume = true,
  height = 420,
}: {
  candles: Candle[];
  levels?: ChartLevels;
  overlays?: ChartOverlays;
  kbosOverlays?: KbosChartOverlays;
  customOverlays?: CustomStrategyChartOverlay | null;
  showVolume?: boolean;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('theme-light'));
  const [showKbosHtf, setShowKbosHtf] = useState(true);
  const [showDemaAtr, setShowDemaAtr] = useState(true);
  const [showAlmaRibbon, setShowAlmaRibbon] = useState(true);
  const [showEmas, setShowEmas] = useState(false);
  const [showCustomOverlay, setShowCustomOverlay] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsLight(document.documentElement.classList.contains('theme-light'));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const dedupAsc = <T extends { time: number | Time }>(arr: T[]): T[] => {
      const m = new Map<number, T>();
      for (const item of arr) {
        const t = Number(item.time);
        if (Number.isFinite(t)) m.set(t, item);
      }
      return Array.from(m.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => v);
    };

    const chart = createChart(el, {
      width: Math.max(280, el.clientWidth || 600),
      height,
      layout: {
        background: { type: ColorType.Solid, color: isLight ? '#ffffff' : '#060c1c' },
        textColor: isLight ? '#4b6491' : '#96a9cf',
      },
      grid: {
        vertLines: { color: isLight ? 'rgba(12, 68, 200, 0.06)' : 'rgba(120, 165, 255, 0.06)' },
        horzLines: { color: isLight ? 'rgba(12, 68, 200, 0.06)' : 'rgba(120, 165, 255, 0.06)' },
      },
      crosshair: { mode: 1 },
      timeScale: {
        timeVisible: true,
        borderColor: isLight ? 'rgba(12, 68, 200, 0.14)' : 'rgba(120, 165, 255, 0.14)',
      },
      rightPriceScale: {
        borderColor: isLight ? 'rgba(12, 68, 200, 0.14)' : 'rgba(120, 165, 255, 0.14)',
        scaleMargins: { top: 0.08, bottom: showVolume ? 0.2 : 0.08 },
      },
    });
    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor: '#10D856',
      downColor: '#f43f5e',
      borderUpColor: '#10D856',
      borderDownColor: '#f43f5e',
      wickUpColor: '#10D856',
      wickDownColor: '#f43f5e',
    });

    if (candles.length > 0) {
      const sortedCandles = dedupAsc(
        candles.map((c) => ({
          time: Math.floor(c.timestamp / 1000) as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }))
      );
      series.setData(
        sortedCandles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
      );

      if (showVolume) {
        const volSeries = chart.addHistogramSeries({
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        });
        volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
        volSeries.setData(
          sortedCandles.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(16, 216, 86, 0.24)' : 'rgba(244, 63, 94, 0.24)',
          }))
        );
      }

      if (showMarkers && ((showCustomOverlay && customOverlays?.markers?.length) || kbosOverlays?.markers?.length)) {
        const rawMarkers =
          showCustomOverlay && customOverlays?.markers?.length
            ? customOverlays.markers
            : kbosOverlays?.markers ?? [];
        const sortedRaw = dedupAsc(
          rawMarkers.map((m) => ({
            time: m.time as Time,
            position: m.position,
            color: m.color,
            shape: m.shape,
            text: m.text.includes('BUY') ? 'BUY' : m.text.includes('SELL') ? 'SELL' : m.text.slice(0, 6),
          }))
        );
        const barStepSec =
          sortedCandles.length >= 2
            ? Math.max(60, Number(sortedCandles[1]!.time) - Number(sortedCandles[0]!.time))
            : 900;
        const firstSec = Number(sortedCandles[0]?.time ?? 0);
        const lastSec = Number(sortedCandles[sortedCandles.length - 1]?.time ?? 0);
        const spanSec = Math.max(0, lastSec - firstSec);
        const minGapSec = Math.max(barStepSec * 16, Math.floor(spanSec / 6));
        const spaced: SeriesMarker<Time>[] = [];
        for (const m of sortedRaw) {
          const prev = spaced[spaced.length - 1];
          if (!prev || Number(m.time) - Number(prev.time) >= minGapSec) {
            spaced.push(m);
          } else {
            // Keep the newer signal within the cluster so labels stay readable
            spaced[spaced.length - 1] = m;
          }
        }
        series.setMarkers(spaced);
      }

      chart.timeScale().fitContent();
    }

    if (showCustomOverlay && customOverlays?.plots?.length) {
      for (const pl of customOverlays.plots) {
        if (!pl.points.length) continue;
        const cs = chart.addLineSeries({
          color: pl.color || '#38e1ff',
          lineWidth: 2,
          priceLineVisible: false,
          title: pl.title,
        });
        cs.setData(dedupAsc(pl.points.map((p) => ({ time: p.time as Time, value: p.value }))));
      }
    }

    if (showEmas || (!kbosOverlays && overlays)) {
      if (overlays?.ema20?.length) {
        const s20 = chart.addLineSeries({ color: '#1464F6', lineWidth: 1, priceLineVisible: false });
        s20.setData(dedupAsc(overlays.ema20.map((p) => ({ time: p.time as Time, value: p.value }))));
      }
      if (overlays?.ema50?.length) {
        const s50 = chart.addLineSeries({ color: '#FF8A00', lineWidth: 1, priceLineVisible: false });
        s50.setData(dedupAsc(overlays.ema50.map((p) => ({ time: p.time as Time, value: p.value }))));
      }
      if (overlays?.ema200?.length) {
        const s200 = chart.addLineSeries({ color: '#8b5cf6', lineWidth: 2, priceLineVisible: false });
        s200.setData(dedupAsc(overlays.ema200.map((p) => ({ time: p.time as Time, value: p.value }))));
      }
    }

    if (showKbosHtf && kbosOverlays?.closeSeriesAlt?.length && kbosOverlays?.openSeriesAlt?.length) {
      const cLine = chart.addLineSeries({ color: '#10D856', lineWidth: 2, priceLineVisible: false, title: 'KBOs Close' });
      cLine.setData(dedupAsc(kbosOverlays.closeSeriesAlt.map((p) => ({ time: p.time as Time, value: p.value }))));
      const oLine = chart.addLineSeries({ color: '#f43f5e', lineWidth: 2, priceLineVisible: false, title: 'KBOs Open' });
      oLine.setData(dedupAsc(kbosOverlays.openSeriesAlt.map((p) => ({ time: p.time as Time, value: p.value }))));
    }

    if (showDemaAtr && kbosOverlays?.demaAtr?.length) {
      const daLine = chart.addLineSeries({ lineWidth: 2, priceLineVisible: false, title: 'DEMA ATR' });
      daLine.setData(
        dedupAsc(
          kbosOverlays.demaAtr.map((p) => ({
            time: p.time as Time,
            value: p.value,
            color: p.trend === 'BULL' ? '#10D856' : '#f43f5e',
          }))
        )
      );
    }

    if (showAlmaRibbon && kbosOverlays?.almaRibbon?.bands?.length) {
      for (const band of kbosOverlays.almaRibbon.bands) {
        if (!band.points.length) continue;
        const bSeries = chart.addLineSeries({ color: band.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        bSeries.setData(dedupAsc(band.points.map((p) => ({ time: p.time as Time, value: p.value }))));
      }
    }

    const addLevel = (price: number | undefined, title: string, color: string) => {
      if (!price || !Number.isFinite(price)) return;
      series.createPriceLine({ price, color, lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title });
    };

    if (levels) {
      addLevel(levels.entry, 'ENTRY', '#1464F6');
      addLevel(levels.stopLoss, 'STOP LOSS', '#f43f5e');
      addLevel(levels.tp1, 'TP1', '#10D856');
      addLevel(levels.tp2, 'TP2', '#FF8A00');
      addLevel(levels.tp3, 'TP3', '#f97316');
      levels.supports?.forEach((s, idx) => addLevel(s, `S${idx + 1}`, '#06b6d4'));
      levels.resistances?.forEach((r, idx) => addLevel(r, `R${idx + 1}`, '#8b5cf6'));
    }

    const ro = new ResizeObserver(() => {
      if (el && el.clientWidth > 0) chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      try { chart.remove(); } catch { /* ignore */ }
    };
  }, [candles, levels, overlays, kbosOverlays, customOverlays, showVolume, height, showKbosHtf, showDemaAtr, showAlmaRibbon, showEmas, showCustomOverlay, showMarkers, isLight]);

  return (
    <div className="space-y-2">
      {(kbosOverlays || customOverlays) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {customOverlays && (
            <button
              type="button"
              onClick={() => setShowCustomOverlay((v) => !v)}
              className={`px-2.5 py-1 rounded-lg border font-bold transition ${showCustomOverlay ? 'btn-lime' : 'surface-soft text-dim'}`}
            >
              {customOverlays.language ? `${customOverlays.language.toUpperCase()} · ` : ''}{customOverlays.title}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowKbosHtf((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-bold transition ${showKbosHtf ? 'btn-emerald' : 'surface-soft text-dim'}`}
          >
            KBOs HTF
          </button>
          <button
            type="button"
            onClick={() => setShowDemaAtr((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-bold transition ${showDemaAtr ? 'btn-cobalt' : 'surface-soft text-dim'}`}
          >
            DEMA ATR
          </button>
          <button
            type="button"
            onClick={() => setShowAlmaRibbon((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-bold transition ${showAlmaRibbon ? 'banner-cobalt-soft text-brand' : 'surface-soft text-dim'}`}
          >
            RLA MA Ribbon
          </button>
          <button
            type="button"
            onClick={() => setShowMarkers((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-bold transition ${showMarkers ? 'btn-cobalt' : 'surface-soft text-dim'}`}
          >
            BUY/SELL Arrows
          </button>
          {overlays && (
            <button
              type="button"
              onClick={() => setShowEmas((v) => !v)}
              className={`px-2.5 py-1 rounded-lg border font-bold transition ${showEmas ? 'bg-[#FF8A00]/15 text-flame border-[#FF8A00]/40' : 'surface-soft text-dim'}`}
            >
              EMA 20/50/200
            </button>
          )}
        </div>
      )}
      <div ref={containerRef} className="w-full rounded-2xl overflow-hidden border" />
    </div>
  );
}
