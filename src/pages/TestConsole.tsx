import { useState } from 'react'
import {
  getAccount,
  getPortfolioSummary,
  getPositions,
  searchAssets,
  getOrders,
  placeOrder,
  cancelOrder,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from '../services/api'

/* ── Tiny helper: show JSON result or error ─────────────────────── */
function ResultBox({ data, error }: { data: unknown; error: string }) {
  if (error) return <pre className="mt-2 p-2 text-red-600 text-xs">{error}</pre>
  if (data === null) return null
  return <pre className="mt-2 p-2 text-xs overflow-auto max-h-64">{JSON.stringify(data, null, 2)}</pre>
}

export default function TestConsole() {
  /* ── Portfolio / Account ─────────────────────────────────────── */
  const [account, setAccount] = useState<unknown>(null)
  const [accountErr, setAccountErr] = useState('')
  const [portfolio, setPortfolio] = useState<unknown>(null)
  const [portfolioErr, setPortfolioErr] = useState('')

  /* ── Positions ───────────────────────────────────────────────── */
  const [positions, setPositions] = useState<unknown>(null)
  const [positionsErr, setPositionsErr] = useState('')

  /* ── Search ──────────────────────────────────────────────────── */
  const [searchQ, setSearchQ] = useState('')
  const [searchRes, setSearchRes] = useState<unknown>(null)
  const [searchErr, setSearchErr] = useState('')

  /* ── Place Order ─────────────────────────────────────────────── */
  const [orderSymbol, setOrderSymbol] = useState('')
  const [orderQty, setOrderQty] = useState('1')
  const [orderSide, setOrderSide] = useState('buy')
  const [orderType, setOrderType] = useState('market')
  const [orderTif, setOrderTif] = useState('gtc')
  const [orderLimit, setOrderLimit] = useState('')
  const [orderRes, setOrderRes] = useState<unknown>(null)
  const [orderErr, setOrderErr] = useState('')

  /* ── Orders List ─────────────────────────────────────────────── */
  const [orders, setOrders] = useState<unknown>(null)
  const [ordersErr, setOrdersErr] = useState('')
  const [cancelId, setCancelId] = useState('')
  const [cancelRes, setCancelRes] = useState<unknown>(null)
  const [cancelErr, setCancelErr] = useState('')

  /* ── Watchlist ───────────────────────────────────────────────── */
  const [watchlist, setWatchlist] = useState<unknown>(null)
  const [watchlistErr, setWatchlistErr] = useState('')
  const [wlSymbol, setWlSymbol] = useState('')
  const [wlAddRes, setWlAddRes] = useState<unknown>(null)
  const [wlAddErr, setWlAddErr] = useState('')
  const [wlDelSymbol, setWlDelSymbol] = useState('')
  const [wlDelRes, setWlDelRes] = useState<unknown>(null)
  const [wlDelErr, setWlDelErr] = useState('')

  /* ── Handlers ────────────────────────────────────────────────── */
  const wrap = async (
    fn: () => Promise<unknown>,
    set: (d: unknown) => void,
    setErr: (e: string) => void,
  ) => {
    setErr('')
    set(null)
    try {
      set(await fn())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-bold mb-6">My Broker — Test Console</h1>

      {/* ── 1. Account ──────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="font-semibold mb-1">Account Info</h2>
        <button onClick={() => wrap(getAccount, setAccount, setAccountErr)}>
          GET /api/alpaca/account
        </button>
        <ResultBox data={account} error={accountErr} />
      </section>

      {/* ── 2. Portfolio Summary ────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="font-semibold mb-1">Portfolio (valor en tiempo real)</h2>
        <button onClick={() => wrap(getPortfolioSummary, setPortfolio, setPortfolioErr)}>
          GET /api/portfolio/summary
        </button>
        <ResultBox data={portfolio} error={portfolioErr} />
      </section>

      {/* ── 3. Positions ────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="font-semibold mb-1">Posiciones abiertas</h2>
        <button onClick={() => wrap(getPositions, setPositions, setPositionsErr)}>
          GET /api/alpaca/positions
        </button>
        <ResultBox data={positions} error={positionsErr} />
      </section>

      {/* ── 4. Search ───────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="font-semibold mb-1">Buscar acción / ETF / crypto</h2>
        <div className="flex gap-2">
          <input
            placeholder="AAPL, BTC, SPY..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
          <button onClick={() => wrap(() => searchAssets(searchQ), setSearchRes, setSearchErr)}>
            Buscar
          </button>
        </div>
        <ResultBox data={searchRes} error={searchErr} />
      </section>

      {/* ── 5. Place Order ──────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="font-semibold mb-1">Comprar / Vender</h2>
        <p className="text-xs text-gray-500 mb-1">
          Mercado cerrado: usa limit + GTC para acciones, o market para crypto (24/7)
        </p>
        <div className="flex flex-wrap gap-2 mb-1">
          <input placeholder="Symbol" value={orderSymbol} onChange={e => setOrderSymbol(e.target.value)} className="w-24" />
          <input placeholder="Qty" type="number" value={orderQty} onChange={e => setOrderQty(e.target.value)} className="w-16" />
          <select value={orderSide} onChange={e => setOrderSide(e.target.value)}>
            <option value="buy">buy</option>
            <option value="sell">sell</option>
          </select>
          <select value={orderType} onChange={e => setOrderType(e.target.value)}>
            <option value="market">market</option>
            <option value="limit">limit</option>
            <option value="stop">stop</option>
            <option value="stop_limit">stop_limit</option>
          </select>
          <select value={orderTif} onChange={e => setOrderTif(e.target.value)}>
            <option value="gtc">GTC</option>
            <option value="day">DAY</option>
          </select>
          {(orderType === 'limit' || orderType === 'stop_limit') && (
            <input placeholder="Limit $" type="number" value={orderLimit} onChange={e => setOrderLimit(e.target.value)} className="w-24" />
          )}
        </div>
        <button onClick={() =>
          wrap(
            () => placeOrder({
              symbol: orderSymbol,
              qty: Number(orderQty),
              side: orderSide,
              order_type: orderType,
              time_in_force: orderTif,
              limit_price: orderLimit ? Number(orderLimit) : null,
            }),
            setOrderRes,
            setOrderErr,
          )
        }>
          Enviar orden
        </button>
        <ResultBox data={orderRes} error={orderErr} />
      </section>

      {/* ── 6. Orders List ──────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="font-semibold mb-1">Ver órdenes</h2>
        <div className="flex gap-2">
          <button onClick={() => wrap(() => getOrders('all'), setOrders, setOrdersErr)}>All</button>
          <button onClick={() => wrap(() => getOrders('open'), setOrders, setOrdersErr)}>Open</button>
          <button onClick={() => wrap(() => getOrders('closed'), setOrders, setOrdersErr)}>Closed</button>
        </div>
        <ResultBox data={orders} error={ordersErr} />
      </section>

      {/* ── 7. Cancel Order ─────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="font-semibold mb-1">Cancelar orden</h2>
        <div className="flex gap-2">
          <input placeholder="Order ID" value={cancelId} onChange={e => setCancelId(e.target.value)} />
          <button onClick={() =>
            wrap(() => cancelOrder(cancelId).then(() => ({ cancelled: cancelId })), setCancelRes, setCancelErr)
          }>
            Cancelar
          </button>
        </div>
        <ResultBox data={cancelRes} error={cancelErr} />
      </section>

      {/* ── 8. Watchlist ────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="font-semibold mb-1">Watchlist</h2>
        <button onClick={() => wrap(getWatchlist, setWatchlist, setWatchlistErr)}>
          Obtener watchlist
        </button>
        <ResultBox data={watchlist} error={watchlistErr} />

        <h3 className="font-semibold mt-3 mb-1 text-sm">Agregar a watchlist</h3>
        <div className="flex gap-2">
          <input placeholder="Symbol" value={wlSymbol} onChange={e => setWlSymbol(e.target.value)} className="w-24" />
          <button onClick={() =>
            wrap(() => addToWatchlist(wlSymbol), setWlAddRes, setWlAddErr)
          }>
            Agregar
          </button>
        </div>
        <ResultBox data={wlAddRes} error={wlAddErr} />

        <h3 className="font-semibold mt-3 mb-1 text-sm">Eliminar de watchlist</h3>
        <div className="flex gap-2">
          <input placeholder="Symbol" value={wlDelSymbol} onChange={e => setWlDelSymbol(e.target.value)} className="w-24" />
          <button onClick={() =>
            wrap(() => removeFromWatchlist(wlDelSymbol).then(() => ({ removed: wlDelSymbol })), setWlDelRes, setWlDelErr)
          }>
            Eliminar
          </button>
        </div>
        <ResultBox data={wlDelRes} error={wlDelErr} />
      </section>
    </div>
  )
}
