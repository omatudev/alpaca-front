import { useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  getWatchlist,
  getPositions,
  getMultipleSnapshots,
  getOrders,
  cancelOrder,
} from "../services/api";

interface Props {
  onSelect: (asset: { symbol: string; name?: string }) => void;
  selectedSymbol?: string;
  cash?: number | null;
}

interface WatchlistAsset {
  id: string;
  symbol: string;
  name: string;
}

interface Position {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
}

interface Snapshot {
  price?: number;
  change?: number;
  change_pct?: number;
  latest_trade?: { price: number };
  previous_daily_bar?: { close: number };
}

interface Order {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: string | null;
  notional: string | null;
  order_type: string;
  status: string;
  filled_qty: string;
  limit_price: string | null;
  submitted_at: string;
}

const ACTIVE_STATUSES = new Set([
  "new",
  "open",
  "pending_new",
  "accepted",
  "pending_cancel",
  "pending_replace",
  "accepted_for_bidding",
  "partially_filled",
]);

export default function WatchlistPanel({
  onSelect,
  selectedSymbol,
  cash,
}: Props) {
  const queryClient = useQueryClient();

  /* ─── Data queries ─────────────────────────────────────────── */
  const watchlistQuery = useQuery({
    queryKey: ["watchlist"],
    queryFn: getWatchlist,
    refetchInterval: 30_000,
  });

  const positionsQuery = useQuery({
    queryKey: ["positions"],
    queryFn: getPositions,
    refetchInterval: 10_000,
  });

  const ordersQuery = useQuery({
    queryKey: ["sidebar-orders"],
    queryFn: () => getOrders("open", 20),
    refetchInterval: 6_000,
  });

  const positionsList = (positionsQuery.data ?? []) as Position[];
  const assets: WatchlistAsset[] = watchlistQuery.data?.assets ?? [];
  const ordersList = ((ordersQuery.data ?? []) as Order[]).filter((o) =>
    ACTIVE_STATUSES.has(o.status),
  );

  // All unique symbols across positions + watchlist (for single snapshot call)
  const allSymbols = useMemo<string[]>(() => {
    const set = new Set<string>();
    positionsList.forEach((p) => set.add(p.symbol));
    assets.forEach((a) => set.add(a.symbol));
    return [...set];
  }, [positionsList, assets]);

  const snapshots = useQuery({
    queryKey: ["sidebar-snapshots", allSymbols.join(",")],
    queryFn: () => getMultipleSnapshots(allSymbols),
    enabled: allSymbols.length > 0,
    refetchInterval: 4_000,
  });

  const snapMap = (snapshots.data ?? {}) as Record<string, Snapshot>;

  const posMap = useMemo(() => {
    const m = new Map<string, Position>();
    positionsList.forEach((p) => m.set(p.symbol, p));
    return m;
  }, [positionsList]);

  const posSymbols = new Set(positionsList.map((p) => p.symbol));
  const watchlistOnly = assets.filter((a) => !posSymbols.has(a.symbol));
  // All symbols currently in the watchlist (for delete button visibility)
  const watchlistSymbolSet = new Set(assets.map((a) => a.symbol));

  const flatItems: Array<{
    symbol: string;
    name: string;
    key: string;
    isWl: boolean;
  }> = [
    ...positionsList.map((p) => ({
      symbol: p.symbol,
      name: p.symbol,
      key: `pos-${p.symbol}`,
      isWl: watchlistSymbolSet.has(p.symbol), // show delete if also in watchlist
    })),
    ...watchlistOnly.map((a) => ({
      symbol: a.symbol,
      name: a.name,
      key: `wl-${a.id}`,
      isWl: true,
    })),
  ];

  const cancelMutation = useMutation({
    mutationFn: cancelOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sidebar-orders"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
    },
  });

  const fmt$ = (v: number) =>
    v.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  /* ─── Render ────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full">
      <div
        className="flex-1 overflow-y-auto no-scrollbar"
        style={{ scrollbarWidth: "none" }}
      >
        {/* ── CASH ── */}
        {cash != null && (
          <div className="px-4 pb-3">
            <div
              className="text-[20px] tabular-nums font-light tracking-tight"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              ${fmt$(cash)}
            </div>
          </div>
        )}
        <div
          className="px-3 pt-2 pb-1 text-[8px] tracking-[0.4em] uppercase font-light"
          style={{ color: "rgba(255,255,255,0.18)" }}
        >
          WATCHLIST
        </div>
        {/* ── FLAT SYMBOL LIST ── */}
        {flatItems.map(({ symbol, name, key }) => {
          const pos = posMap.get(symbol);
          const snap = snapMap[symbol];
          const price = snap?.price ?? snap?.latest_trade?.price ?? null;
          const changePct = snap?.change_pct ?? null;
          const dailyUp = (changePct ?? 0) >= 0;
          const isSelected = selectedSymbol === symbol;

          const marketValue = pos ? parseFloat(pos.market_value) : null;
          const costBasis = pos ? parseFloat(pos.cost_basis) : null;
          const plpc = pos ? parseFloat(pos.unrealized_plpc) * 100 : null;
          const plUp = (plpc ?? 0) >= 0;

          return (
            <div
              key={key}
              className="group w-full flex items-center transition-colors hover:bg-white/4"
              style={
                isSelected
                  ? { borderBottom: "1px solid rgba(255,255,255,0.30)" }
                  : { borderBottom: "1px solid transparent" }
              }
            >
              <button
                onClick={() => onSelect({ symbol, name })}
                className="flex-1 min-w-0 px-3 py-2.5 text-left"
              >
                <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2 mb-1">
                  <span className="text-white/80 text-[13px] font-semibold tracking-wide">
                    {symbol}
                  </span>
                  <span className="text-white/40 text-[12px] tabular-nums text-right">
                    {price !== null ? `$${fmt$(price)}` : "—"}
                  </span>
                  <span
                    className="text-[12px] tabular-nums font-medium"
                    style={{
                      color: dailyUp
                        ? "rgba(140,210,160,0.85)"
                        : "rgba(220,130,100,0.65)",
                    }}
                  >
                    {changePct !== null
                      ? `${Math.abs(changePct).toFixed(2)}%`
                      : ""}
                  </span>
                </div>

                {pos && (
                  <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2">
                    <span className="text-white/28 text-[11px] tabular-nums">
                      {marketValue !== null ? `$${fmt$(marketValue)}` : "—"}
                    </span>
                    <span className="text-white/28 text-[11px] tabular-nums text-right">
                      {costBasis !== null ? `c $${fmt$(costBasis)}` : ""}
                    </span>
                    <span
                      className="text-[11px] tabular-nums font-medium"
                      style={{
                        color: plUp
                          ? "rgba(140,210,160,0.70)"
                          : "rgba(220,130,100,0.55)",
                      }}
                    >
                      {plpc !== null ? `${Math.abs(plpc).toFixed(2)}%` : ""}
                    </span>
                  </div>
                )}
              </button>
            </div>
          );
        })}

        {flatItems.length === 0 &&
          !watchlistQuery.isLoading &&
          !positionsQuery.isLoading && (
            <p className="text-white/15 text-xs text-center mt-8">
              Sin posiciones ni watchlist
            </p>
          )}

        {/* ── ORDERS ── */}
        {ordersList.length > 0 && (
          <div>
            <div
              className="px-3 pt-4 pb-1 text-[8px] tracking-[0.4em] uppercase font-light"
              style={{ color: "rgba(255,255,255,0.18)" }}
            >
              ÓRDENES
            </div>
            {ordersList.map((order) => {
              const isBuy = order.side === "buy";
              const qtyStr = order.qty
                ? `${order.qty}`
                : order.notional
                  ? `$${parseFloat(order.notional).toFixed(0)}`
                  : "—";
              const isCancelling =
                cancelMutation.isPending &&
                cancelMutation.variables === order.id;

              return (
                <div
                  key={order.id}
                  className="group flex items-center justify-between px-3 py-2 hover:bg-white/3 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-[9px] tracking-[0.2em] font-medium uppercase"
                        style={{
                          color: isBuy
                            ? "rgba(140,210,160,0.75)"
                            : "rgba(220,130,100,0.70)",
                        }}
                      >
                        {order.side}
                      </span>
                      <span className="text-[13px] font-semibold text-white/70">
                        {order.symbol}
                      </span>
                      <span className="text-[11px] tabular-nums text-white/35">
                        {qtyStr}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => cancelMutation.mutate(order.id)}
                    disabled={isCancelling}
                    title="Cancelar orden"
                    className="ml-2 px-2 py-1 rounded-xl opacity-0 group-hover:opacity-100
                               text-[9px] tracking-[0.2em] uppercase font-light transition-all
                               disabled:opacity-30
                               bg-white/5 text-white/30 border border-white/8
                               hover:bg-white/10 hover:text-white/60 hover:border-white/20"
                  >
                    {isCancelling ? "..." : "✕"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
