import { useEffect, useRef, useCallback, useState } from 'react'

export interface PriceTick {
  symbol: string
  price: number
  bid?: number
  ask?: number
  timestamp: string
}

const RECONNECT_BASE = 500   // ms
const RECONNECT_MAX = 10_000 // ms
const HEARTBEAT_MS = 15_000 // ping interval

/**
 * WebSocket hook with:
 * - Auto-reconnect with exponential backoff
 * - Heartbeat pings to keep connection alive
 * - Efficient subscription management (diff-based)
 * - Ref-based fast reads (getPrice doesn't cause re-renders)
 * - State `connected` + `lastTick` for components that need reactivity
 */
export function useRealtimePrice(symbols: string[]) {
  const wsRef = useRef<WebSocket | null>(null)
  const pricesRef = useRef<Map<string, PriceTick>>(new Map())
  const [connected, setConnected] = useState(false)
  const [lastTick, setLastTick] = useState<PriceTick | null>(null)
  const subscribedRef = useRef<string[]>([])
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryDelay = useRef(RECONNECT_BASE)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const token = localStorage.getItem('jwt_token')
    const wsUrl = token
      ? `${protocol}://${window.location.host}/ws/prices?token=${encodeURIComponent(token)}`
      : `${protocol}://${window.location.host}/ws/prices`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return }
      setConnected(true)
      retryDelay.current = RECONNECT_BASE // reset backoff

      // Re-subscribe
      if (subscribedRef.current.length > 0) {
        ws.send(JSON.stringify({ action: 'subscribe', symbols: subscribedRef.current }))
      }

      // Start heartbeat
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'ping' }))
        }
      }, HEARTBEAT_MS)
    }

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        if (data.type === 'price' && data.price != null) {
          const tick: PriceTick = {
            symbol: data.symbol,
            price: data.price,
            bid: data.bid,
            ask: data.ask,
            timestamp: data.timestamp,
          }
          pricesRef.current.set(data.symbol, tick)
          // Trigger React re-render only once per tick
          setLastTick(tick)
        }
      } catch {
        // ignore
      }
    }

    const scheduleReconnect = (ev: CloseEvent) => {
      if (!mountedRef.current) return
      setConnected(false)
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      // 4001 = auth rejected — don't retry, no token or token invalid
      if (ev.code === 4001) return
      reconnectRef.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, RECONNECT_MAX)
        connect()
      }, retryDelay.current)
    }

    ws.onclose = scheduleReconnect
    ws.onerror = () => {
      ws.close() // triggers onclose → reconnect
    }
  }, [])

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  // Manage subscriptions when symbols list changes
  useEffect(() => {
    const ws = wsRef.current
    const prev = new Set(subscribedRef.current)
    const next = new Set(symbols)

    const toSub = symbols.filter(s => !prev.has(s))
    const toUnsub = subscribedRef.current.filter(s => !next.has(s))

    if (ws && ws.readyState === WebSocket.OPEN) {
      if (toSub.length > 0) {
        ws.send(JSON.stringify({ action: 'subscribe', symbols: toSub }))
      }
      if (toUnsub.length > 0) {
        ws.send(JSON.stringify({ action: 'unsubscribe', symbols: toUnsub }))
      }
    }

    subscribedRef.current = symbols
  }, [symbols.join(',')])

  /** Read latest price for a symbol (ref-based, always fresh) */
  const getPrice = useCallback(
    (symbol: string) => pricesRef.current.get(symbol) ?? null,
    [],
  )

  return { connected, lastTick, getPrice }
}
