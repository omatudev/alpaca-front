import { useEffect, useRef } from 'react'
import { createChart, IChartApi, ISeriesApi, ColorType, CandlestickData, Time, CandlestickSeries } from 'lightweight-charts'

export interface Bar {
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: string
}

interface Props {
  bars: Bar[]
  /** Latest real-time price from WebSocket */
  lastPrice?: number | null
}

/* Neon palette */
const UP_COLOR   = '#bf00ff' // neon purple
const DOWN_COLOR = '#00d4ff' // neon light blue

/**
 * Full-screen candlestick chart that fills its parent container.
 *
 * Professional live-update strategy:
 * - Historical bars → setData() once per query change
 * - Each WS tick   → update() the running (last) candle in-place
 *     • keeps original open
 *     • adjusts high = max(prev high, price)
 *     • adjusts low  = min(prev low, price)
 *     • sets   close = price
 */
export default function FullChart({ bars, lastPrice }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  // Running candle state (not React state — we don't want re-renders)
  const runningRef = useRef<{ time: Time; open: number; high: number; low: number; close: number } | null>(null)

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.4)',
        fontFamily: "'Inter', system-ui, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      crosshair: {
        horzLine: { visible: false, labelVisible: false },
        vertLine: { visible: false, labelVisible: false },
      },
      timeScale: {
        visible: false,
      },
      rightPriceScale: {
        visible: false,
      },
      leftPriceScale: {
        visible: false,
      },
      handleScroll: false,
      handleScale: false,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    chartRef.current = chart
    seriesRef.current = series

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      chart.resize(width, height)
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, []) // only once

  // Set historical data when bars change (from REST)
  useEffect(() => {
    if (!seriesRef.current || bars.length === 0) return

    const data: CandlestickData<Time>[] = bars.map(b => ({
      time: (new Date(b.timestamp).getTime() / 1000) as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }))

    seriesRef.current.setData(data)
    chartRef.current?.timeScale().fitContent()

    // Seed running candle from last historical bar
    const last = bars[bars.length - 1]
    runningRef.current = {
      time: (new Date(last.timestamp).getTime() / 1000) as Time,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
    }
  }, [bars])

  // Update running candle with each WS tick (no re-render, no new candle)
  useEffect(() => {
    if (!seriesRef.current || !lastPrice || !runningRef.current) return

    const rc = runningRef.current
    rc.close = lastPrice
    rc.high  = Math.max(rc.high, lastPrice)
    rc.low   = Math.min(rc.low, lastPrice)

    seriesRef.current.update({
      time: rc.time,
      open: rc.open,
      high: rc.high,
      low:  rc.low,
      close: rc.close,
    })
  }, [lastPrice])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
    />
  )
}
