import { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';

// Candlestick chart (TradingView lightweight-charts). Expects candles with
// { time(ISO), open, high, low, close }. Time is converted to UNIX seconds.
export default function Chart({ candles, height = 300 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      height,
      width: el.clientWidth,
      layout: { background: { color: 'transparent' }, textColor: '#8b97a7' },
      grid: { vertLines: { color: '#1f2733' }, horzLines: { color: '#1f2733' } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#2a3340' },
      rightPriceScale: { borderColor: '#2a3340' },
      crosshair: { mode: 0 },
    });
    const series = chart.addCandlestickSeries({
      upColor: '#2ea043', downColor: '#f85149', borderVisible: false,
      wickUpColor: '#2ea043', wickDownColor: '#f85149',
    });
    chartRef.current = chart;
    seriesRef.current = series;
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [height]);

  useEffect(() => {
    if (!seriesRef.current || !candles?.length) return;
    const data = candles.map((c) => ({
      time: Math.floor(new Date(c.time).getTime() / 1000),
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return <div ref={containerRef} style={{ width: '100%' }} />;
}
