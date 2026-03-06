import axios from 'axios'

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? window.location.origin
const api = axios.create({
  baseURL: backendUrl,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request when available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Account / Portfolio ─────────────────────────────────────────────
export const getAccount = () =>
  api.get('/api/alpaca/account').then(r => r.data)

export const getPortfolioSummary = () =>
  api.get('/api/portfolio/summary').then(r => r.data)

export const getPortfolioEquityHistory = (period = '1D', timeframe = '5Min') =>
  api.get('/api/portfolio/equity-history', { params: { period, timeframe } }).then(r => r.data)

export const getPositions = () =>
  api.get('/api/alpaca/positions').then(r => r.data)

// ── Search ──────────────────────────────────────────────────────────
export const searchAssets = (q: string) =>
  api.get('/api/alpaca/assets/search', { params: { q } }).then(r => r.data)

// ── Orders ──────────────────────────────────────────────────────────
export const getOrders = (status = 'all', limit = 50) =>
  api.get('/api/alpaca/orders', { params: { status, limit } }).then(r => r.data)

export const placeOrder = (order: {
  symbol: string
  qty: number
  side: string
  order_type: string
  time_in_force?: string
  limit_price?: number | null
  stop_price?: number | null
}) => api.post('/api/alpaca/orders', order).then(r => r.data)

export const cancelOrder = (orderId: string) =>
  api.delete(`/api/alpaca/orders/${orderId}`)

// ── Watchlist (Alpaca /v2/watchlists) ───────────────────────────────
export const getWatchlist = () =>
  api.get('/api/watchlist/').then(r => r.data)

export const addToWatchlist = (symbol: string) =>
  api.post('/api/watchlist/', { symbol }).then(r => r.data)

export const removeFromWatchlist = (symbol: string) =>
  api.delete(`/api/watchlist/${symbol}`)

// ── Market Data ─────────────────────────────────────────────────────
export const getBars = (symbol: string, timeframe = '1Day', start?: string) =>
  api.get(`/api/alpaca/market/bars/${encodeURIComponent(symbol)}`, {
    params: { timeframe, ...(start ? { start } : {}) },
  }).then(r => r.data)

export const getMarketClock = () =>
  api.get('/api/alpaca/market/clock').then(r => r.data)

export const getSnapshot = (symbol: string) =>
  api.get(`/api/alpaca/market/snapshot/${encodeURIComponent(symbol)}`).then(r => r.data)

export const getMultipleSnapshots = (symbols: string[]) =>
  api.get('/api/alpaca/market/snapshots', { params: { symbols: symbols.join(',') } }).then(r => r.data)

export default api
