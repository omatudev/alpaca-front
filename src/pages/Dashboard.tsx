import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import BackgroundChart, {
  type Bar,
  type HoverPoint,
} from "../components/BackgroundChart";
import PriceOverlay from "../components/PriceOverlay";
import SearchBar from "../components/SearchBar";
import TradeControls from "../components/TradeControls";
import WatchlistPanel from "../components/WatchlistPanel";
import { useRealtimePrice } from "../hooks/useRealtimePrice";
import { useAuth } from "../hooks/useAuth";
import {
  getBars,
  getSnapshot,
  getMarketClock,
  getPortfolioSummary,
  getPortfolioEquityHistory,
  getPositions,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from "../services/api";

interface SelectedAsset {
  symbol: string;
  name?: string;
}

type TimeRange = "1d" | "5d" | "1m" | "3m" | "6m" | "1a" | "todos";
type Interval =
  | "1Min"
  | "5Min"
  | "15Min"
  | "30Min"
  | "1Hour"
  | "4Hour"
  | "1Day"
  | "1Week"
  | "1Month";

/*
 * daysBack = calendar-day buffer sent as `start` to Alpaca.
 * No `limit` — Alpaca returns ALL bars from start→now.
 *
 * Each range defines:
 *   • daysBack — how far back to query
 *   • defaultTf — the default interval (sensible for that range)
 *   • intervals — which intervals the user can pick manually
 *
 * Backend supports: 1Min, 5Min, 15Min, 30Min, 1Hour, 4Hour, 1Day, 1Week, 1Month
 */
interface RangeConfig {
  label: string;
  daysBack: number;
  defaultTf: Interval;
  intervals: Interval[];
  /** Intervals valid for the Alpaca portfolio-history endpoint */
  portfolioIntervals: Interval[];
  portfolioDefaultTf: Interval;
}

const PORTFOLIO_PERIOD_MAP: Record<TimeRange, string> = {
  "1d": "1D",
  "5d": "1W",
  "1m": "1M",
  "3m": "3M",
  "6m": "1A",
  "1a": "1A",
  todos: "1A",
};

// Maps our Interval type → Alpaca portfolio-history timeframe string
const INTERVAL_TO_PORTFOLIO_TF: Partial<Record<Interval, string>> = {
  "1Min": "1Min",
  "5Min": "5Min",
  "15Min": "15Min",
  "30Min": "30Min",
  "1Hour": "1H",
  "1Day": "1D",
};

const RANGE_CONFIG: Record<TimeRange, RangeConfig> = {
  "1d": {
    label: "1D",
    daysBack: 4,
    defaultTf: "5Min",
    intervals: ["1Min", "5Min", "15Min", "30Min"],
    portfolioIntervals: ["1Min", "5Min", "15Min", "30Min"],
    portfolioDefaultTf: "5Min",
  },
  "5d": {
    label: "5D",
    daysBack: 9,
    defaultTf: "15Min",
    intervals: ["5Min", "15Min", "30Min", "1Hour"],
    portfolioIntervals: ["5Min", "15Min", "30Min", "1Hour"],
    portfolioDefaultTf: "15Min",
  },
  "1m": {
    label: "1M",
    daysBack: 35,
    defaultTf: "1Hour",
    intervals: ["15Min", "30Min", "1Hour", "4Hour"],
    portfolioIntervals: ["15Min", "30Min", "1Hour"],
    portfolioDefaultTf: "1Hour",
  },
  "3m": {
    label: "3M",
    daysBack: 95,
    defaultTf: "1Day",
    intervals: ["1Hour", "4Hour", "1Day"],
    portfolioIntervals: ["1Hour", "1Day"],
    portfolioDefaultTf: "1Day",
  },
  "6m": {
    label: "6M",
    daysBack: 185,
    defaultTf: "1Day",
    intervals: ["4Hour", "1Day"],
    portfolioIntervals: ["1Day"],
    portfolioDefaultTf: "1Day",
  },
  "1a": {
    label: "1A",
    daysBack: 370,
    defaultTf: "1Day",
    intervals: ["1Day", "1Week"],
    portfolioIntervals: ["1Day"],
    portfolioDefaultTf: "1Day",
  },
  todos: {
    label: "10A",
    daysBack: 3650,
    defaultTf: "1Week",
    intervals: ["1Day", "1Week", "1Month"],
    portfolioIntervals: ["1Day"],
    portfolioDefaultTf: "1Day",
  },
};

const INTERVAL_LABELS: Record<Interval, string> = {
  "1Min": "1m",
  "5Min": "5m",
  "15Min": "15m",
  "30Min": "30m",
  "1Hour": "1H",
  "4Hour": "4H",
  "1Day": "1D",
  "1Week": "1S",
  "1Month": "1M",
};

function SignOutButton() {
  const { signOut, user } = useAuth();
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <div className="flex items-center gap-3">
        <span
          className="text-[9px] tracking-[0.2em] uppercase font-light"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          ¿Salir?
        </span>
        <button
          onClick={signOut}
          className="text-[9px] tracking-[0.2em] uppercase font-light transition-colors"
          style={{ color: "rgba(220,80,70,0.90)" }}
        >
          Sí
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="text-[9px] tracking-[0.2em] uppercase font-light"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      title={user?.email}
      className="flex items-center gap-2 transition-opacity hover:opacity-90"
      style={{ color: "rgba(200,70,65,0.60)" }}
    >
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 15l3-3m0 0l-3-3m3 3H9"
        />
      </svg>
      <span className="text-[9px] tracking-[0.3em] uppercase font-light">
        Cerrar sesión
      </span>
    </button>
  );
}

export default function Dashboard() {
  const [selected, setSelected] = useState<SelectedAsset | null>(() => {
    try {
      const s = localStorage.getItem("broker_selected");
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });
  const [range, setRange] = useState<TimeRange>("1d");
  const [intervalOverride, setIntervalOverride] = useState<Interval | null>(
    null,
  );
  const [hoverPoint, setHoverPoint] = useState<HoverPoint | null>(null);
  const [showTimeframePicker, setShowTimeframePicker] = useState(false);
  const timeframeRef = useRef<HTMLDivElement>(null);
  const [showWatchlist, setShowWatchlist] = useState<boolean>(() => {
    try {
      return localStorage.getItem("wl_open") !== "false";
    } catch {
      return true;
    }
  });

  // Persist watchlist open/close state
  useEffect(() => {
    try {
      localStorage.setItem("wl_open", String(showWatchlist));
    } catch {}
  }, [showWatchlist]);

  // Close timeframe picker on outside click
  useEffect(() => {
    if (!showTimeframePicker) return;
    const handler = (e: MouseEvent) => {
      if (
        timeframeRef.current &&
        !timeframeRef.current.contains(e.target as Node)
      ) {
        setShowTimeframePicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTimeframePicker]);

  // Persist selected symbol across reloads
  useEffect(() => {
    if (selected)
      localStorage.setItem("broker_selected", JSON.stringify(selected));
    else localStorage.removeItem("broker_selected");
  }, [selected]);

  // Derived: active interval (user override or range default)
  const cfg = RANGE_CONFIG[range];
  const activeIntervals = selected ? cfg.intervals : cfg.portfolioIntervals;
  const activeDefaultTf = selected ? cfg.defaultTf : cfg.portfolioDefaultTf;
  const activeInterval =
    intervalOverride && activeIntervals.includes(intervalOverride)
      ? intervalOverride
      : activeDefaultTf;

  // Reset override when range changes
  const handleRangeChange = useCallback((r: TimeRange) => {
    setRange(r);
    setIntervalOverride(null); // reset to default for new range
  }, []);

  /* ─── Portfolio data (default view) ─────────────────────────── */
  const portfolio = useQuery({
    queryKey: ["portfolio-summary"],
    queryFn: getPortfolioSummary,
    refetchInterval: 10_000,
  });

  /* ─── Market clock ───────────────────────────────────────────── */
  const clockQuery = useQuery({
    queryKey: ["market-clock"],
    queryFn: getMarketClock,
    refetchInterval: 30_000,
  });
  const marketIsOpen: boolean = clockQuery.data?.is_open ?? false;
  // Determine pre/post-market: market is closed but within ±4h of next open/close
  const marketLabel = (() => {
    if (clockQuery.isLoading) return null;
    if (marketIsOpen) return "OPEN";
    const now = Date.now();
    const nextOpen = clockQuery.data?.next_open
      ? new Date(clockQuery.data.next_open).getTime()
      : null;
    if (nextOpen && nextOpen - now < 4 * 3600_000) return "PRE-MARKET";
    return "CLOSED";
  })();

  /* ─── Watchlist (for search bar add-to-watchlist) ───────────── */
  const watchlistQuery = useQuery({
    queryKey: ["watchlist"],
    queryFn: getWatchlist,
    refetchInterval: 30_000,
  });
  const watchlistSymbols = useMemo<string[]>(
    () =>
      (watchlistQuery.data?.assets ?? []).map(
        (a: { symbol: string }) => a.symbol,
      ),
    [watchlistQuery.data],
  );

  /* ─── Positions (for trade controls) ───────────────────── */
  const positionsQuery = useQuery({
    queryKey: ["positions"],
    queryFn: getPositions,
    refetchInterval: 10_000,
  });
  const currentPosition = useMemo(() => {
    if (!selected) return null;
    const positions = positionsQuery.data ?? [];
    return (
      positions.find((p: { symbol: string }) => p.symbol === selected.symbol) ??
      null
    );
  }, [selected, positionsQuery.data]);

  /* ─── Snapshot for the selected asset (fast refresh) ────────── */
  const snapshot = useQuery({
    queryKey: ["snapshot", selected?.symbol],
    queryFn: () => getSnapshot(selected!.symbol),
    enabled: !!selected,
    refetchInterval: 2_000,
  });

  /* ─── Historical bars ──────────────────────────────────────── */
  const { daysBack } = cfg;
  const barTf = activeInterval;
  const barStart = useMemo(() => {
    const d = new Date(Date.now() - daysBack * 86_400_000);
    return d.toISOString().split("T")[0];
  }, [daysBack]);

  // Intraday ranges need faster bar updates to stay current
  const barsRefetchMs = range === "1d" || range === "5d" ? 5_000 : 15_000;

  const barsQuery = useQuery({
    queryKey: ["bars", selected?.symbol, range, activeInterval],
    queryFn: () => getBars(selected!.symbol, barTf, barStart),
    enabled: !!selected,
    refetchInterval: barsRefetchMs,
  });

  /* ─── Post-process bars ────────────────────────────────────── */
  const processedBars = useMemo<Bar[]>(() => {
    const raw: Bar[] = barsQuery.data?.bars ?? [];
    if (raw.length === 0) return raw;

    // For 1D: keep only the last trading session (matches TradingView)
    if (range === "1d") {
      const lastDate = raw[raw.length - 1].timestamp.split("T")[0];
      return raw.filter((b) => b.timestamp.split("T")[0] === lastDate);
    }

    return raw;
  }, [barsQuery.data, range]);

  /* ─── Portfolio equity bars (real equity history from Alpaca) ─── */
  const portfolioTf = INTERVAL_TO_PORTFOLIO_TF[activeInterval] ?? "5Min";
  const portfolioHistQuery = useQuery({
    queryKey: ["portfolio-equity", range, activeInterval],
    queryFn: () =>
      getPortfolioEquityHistory(PORTFOLIO_PERIOD_MAP[range], portfolioTf),
    // Always enabled so data is ready when user switches back to portfolio
    refetchInterval: range === "1d" || range === "5d" ? 5_000 : 30_000,
  });
  const portfolioBars: Bar[] = portfolioHistQuery.data?.bars ?? [];

  // Stable key identifying the active data source (must be before bridge)
  const dataKey = selected
    ? `${selected.symbol}|${range}|${activeInterval}`
    : `portfolio|${range}|${activeInterval}`;

  /* ─── Bridge bars: same-source minor refreshes only ──────────── */
  const targetBars: Bar[] = selected ? processedBars : portfolioBars;
  // Track last good bars PER dataKey — only bridge within the same source.
  // Cross-source transitions pass bars=[] so BackgroundChart can wait for
  // real data before unflattening (pendingUnflatten logic).
  const prevBarsRef = useRef<{ dk: string; bars: Bar[] } | null>(null);
  useEffect(() => {
    if (targetBars.length > 0) {
      prevBarsRef.current = { dk: dataKey, bars: targetBars };
    }
  }, [targetBars, dataKey]);
  const bars: Bar[] =
    targetBars.length > 0
      ? targetBars
      : prevBarsRef.current?.dk === dataKey
        ? prevBarsRef.current.bars
        : []; // different source loading — pass empty, BackgroundChart will wait

  // Normalize intraday 1d bars into strict time buckets so the chart
  // renders one candle per interval from session open → now. Missing
  // slots are filled with a placeholder candle (open=high=low=close)
  // seeded from the previous available close. This matches TradingView
  // behaviour where empty slots are reserved and candles evolve in-place.
  const barsForRender: Bar[] = useMemo(() => {
    if (range !== "1d") return bars;

    const INTERVAL_MINS: Partial<Record<Interval, number>> = {
      "1Min": 1,
      "5Min": 5,
      "15Min": 15,
      "30Min": 30,
    };
    const ivMins = INTERVAL_MINS[activeInterval];
    if (!ivMins) return bars;

    // Build slot start times in ET from open → now (or close)
    const nowET = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
    );
    const openET = new Date(nowET);
    openET.setHours(9, 30, 0, 0);
    const closeET = new Date(nowET);
    closeET.setHours(16, 0, 0, 0);
    const end = new Date(Math.min(nowET.getTime(), closeET.getTime()));

    const slots: string[] = [];
    for (let t = openET.getTime(); t <= end.getTime(); t += ivMins * 60_000) {
      const iso = new Date(t).toISOString();
      slots.push(iso);
    }

    // Map existing bars by their timestamp (assumes server returns aligned timestamps)
    const byTs = new Map(bars.map((b) => [b.timestamp, b]));

    const filled: Bar[] = [];
    let prevClose: number | null = null;
    // Seed prevClose with first available bar if present
    if (bars.length > 0) prevClose = bars[0].open;

    for (const s of slots) {
      const b = byTs.get(s);
      if (b) {
        filled.push(b);
        prevClose = b.close;
      } else {
        // placeholder
        const val = prevClose ?? 0;
        filled.push({
          open: val,
          high: val,
          low: val,
          close: val,
          volume: 0,
          timestamp: s,
        });
      }
    }

    // If there are bars after session end (rare), append them
    const tail = bars.filter(
      (b) => new Date(b.timestamp).getTime() > end.getTime(),
    );
    if (tail.length) filled.push(...tail);

    return filled;
  }, [range, activeInterval, bars]);

  /* ─── WebSocket real-time prices ────────────────────────────── */
  const wsSymbols = useMemo(
    () => (selected ? [selected.symbol] : []),
    [selected],
  );
  const { lastTick: _tick, connected, getPrice } = useRealtimePrice(wsSymbols);

  /* ─── Derive display values ─────────────────────────────────── */
  const realtimePrice = selected ? getPrice(selected.symbol)?.price : null;
  const basePrice = selected
    ? (realtimePrice ?? snapshot.data?.price ?? null)
    : parseFloat(portfolio.data?.account?.portfolio_value ?? "0") || null;

  // Hover overrides the displayed price (chart scrubbing)
  const displayPrice = hoverPoint ? hoverPoint.value : basePrice;

  const displayLabel = selected ? selected.symbol : "Mi Portafolio";

  /*
   * Change calculation:
   *   1D  → price − previous_daily_bar.close  (matches Alpaca / TradingView daily change)
   *   5D+ → price − bars[0].open              (period start, matches TradingView period view)
   *
   * When hovering, `displayPrice` is already the hovered bar's close.
   */
  // Extract primitive to avoid re-triggering when snapshot object ref changes
  const prevClose = snapshot.data?.previous_daily_bar?.close as
    | number
    | undefined;

  const rangeChange = useMemo(() => {
    const price = displayPrice;
    if (!price) return { change: null, changePct: null };

    if (selected) {
      if (bars.length === 0) return { change: null, changePct: null };
      let base: number | undefined;
      if (range === "1d") {
        base = prevClose ?? bars[0].open;
      } else {
        base = hoverPoint?.periodFirst ?? bars[0].open;
      }
      if (!base) return { change: null, changePct: null };
      const change = Math.round((price - base) * 100) / 100;
      const changePct = Math.round((change / base) * 10000) / 100;
      return { change, changePct };
    } else {
      // Portfolio view: change vs period-start equity bar
      const pBars = portfolioBars;
      if (pBars.length === 0) return { change: null, changePct: null };
      const base = hoverPoint?.periodFirst ?? pBars[0].open;
      if (!base) return { change: null, changePct: null };
      const change = Math.round((price - base) * 100) / 100;
      const changePct = Math.round((change / base) * 10000) / 100;
      return { change, changePct };
    }
  }, [
    selected,
    displayPrice,
    bars,
    portfolioBars,
    hoverPoint,
    range,
    prevClose,
  ]);

  const displayChange = rangeChange.change;
  const displayChangePct = rangeChange.changePct;

  const lastPrice = selected
    ? (realtimePrice ?? null)
    : parseFloat(portfolio.data?.account?.portfolio_value ?? "0") || null;

  /* ─── Handlers ──────────────────────────────────────────────── */
  const handleSelect = useCallback(
    (asset: { symbol: string; name?: string }) => {
      setSelected({ symbol: asset.symbol, name: asset.name });
    },
    [],
  );

  const handleClear = useCallback(() => {
    setSelected(null);
    setHoverPoint(null);
  }, []);

  // Expected bars: reserve space only for elapsed time in the session,
  // not the full day — so bars always fill ~same proportion of chart.
  // Session: 9:30–16:00 ET = 390 minutes. We add a small buffer (10 extra bars)
  // so there's a sliver of right-side space showing the market is still open.
  const expectedBars = useMemo(() => {
    if (range !== "1d") return undefined;
    const INTERVAL_MINS: Partial<Record<Interval, number>> = {
      "1Min": 1,
      "5Min": 5,
      "15Min": 15,
      "30Min": 30,
    };
    const ivMins = INTERVAL_MINS[activeInterval];
    if (!ivMins) return undefined;

    // Elapsed minutes since 9:30 AM ET
    const nowET = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
    );
    const openET = new Date(nowET);
    openET.setHours(9, 30, 0, 0);
    const closeET = new Date(nowET);
    closeET.setHours(16, 0, 0, 0);

    const elapsedMs = Math.max(
      0,
      Math.min(
        nowET.getTime() - openET.getTime(),
        closeET.getTime() - openET.getTime(),
      ),
    );
    const elapsedMins = elapsedMs / 60_000;
    const elapsedBars = Math.ceil(elapsedMins / ivMins);

    // Ensure we reserve at least half a trading session so the first candles
    // after market open don't appear overly large. Session = 390 minutes.
    const halfSessionBars = Math.ceil(390 / 2 / ivMins);
    const minReserve = halfSessionBars + 6; // half-session + small buffer

    // Just elapsed + buffer — do NOT include bars.length so it stays stable
    // as bars arrive (avoids re-triggering a view reset each new bar).
    return Math.max(elapsedBars + 6, minReserve);
  }, [range, activeInterval]);

  /* ─── Render ────────────────────────────────────────────────── */
  return (
    <div
      className="flex w-screen h-screen overflow-hidden dashboard-root"
      style={{ background: "var(--bg-radial)" }}
    >
      {/* ── Main chart area ── */}
      <div className="flex-1 relative overflow-hidden">
        {/* ── Full-bleed chart as background ── */}
        <BackgroundChart
          bars={barsForRender}
          lastPrice={lastPrice}
          dataKey={dataKey}
          onHoverPoint={setHoverPoint}
          expectedBars={expectedBars}
        />

        {/* ── Vignette: darken edges like MADE ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 55% 40%, transparent 30%, rgba(14,14,18,0.55) 70%, rgba(14,14,18,0.90) 100%)",
          }}
        />

        {/* ════════════════════════════════════════
          TOP NAV
      ════════════════════════════════════════ */}
        <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-7 pt-7">
          {/* Left: status dot + range/interval */}
          <div className="flex items-center gap-5">
            {/* Market status */}
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-1 w-1">
                {(connected || marketIsOpen) && (
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                    style={{
                      background: marketIsOpen
                        ? "rgba(140,210,160,0.55)"
                        : "rgba(255,255,255,0.25)",
                    }}
                  />
                )}
                <span
                  className="relative inline-flex h-1 w-1 rounded-full"
                  style={{
                    background: marketIsOpen
                      ? "rgba(140,210,160,0.65)"
                      : "rgba(255,255,255,0.15)",
                  }}
                />
              </span>
              {marketLabel && (
                <span
                  className="text-[8px] tracking-[0.3em] uppercase font-light"
                  style={{
                    color: marketIsOpen
                      ? "rgba(140,210,160,0.65)"
                      : "rgba(255,255,255,0.18)",
                  }}
                >
                  {marketLabel}
                </span>
              )}
            </span>

            {/* ── Timeframe dropdown ── */}
            <div ref={timeframeRef} className="relative">
              <button
                onClick={() => setShowTimeframePicker((v) => !v)}
                className="flex items-center gap-1.5 text-[9px] tracking-[0.35em] uppercase font-light transition-all duration-200"
                style={{
                  color: showTimeframePicker
                    ? "rgba(255,255,255,0.80)"
                    : "rgba(255,255,255,0.40)",
                }}
              >
                <span>{RANGE_CONFIG[range].label}</span>
                <span style={{ color: "rgba(255,255,255,0.18)" }}>·</span>
                <span>{INTERVAL_LABELS[activeInterval]}</span>
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  style={{
                    opacity: 0.35,
                    transform: showTimeframePicker
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                    transition: "transform 200ms ease",
                  }}
                >
                  <path
                    d="M1 2.5L4 5.5L7 2.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {showTimeframePicker && (
                <div
                  className="absolute top-full left-0 mt-3 flex flex-col gap-3 z-50"
                  style={{
                    background: "rgba(18,18,22,0.96)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: "4px",
                    padding: "14px 16px",
                    backdropFilter: "blur(12px)",
                    minWidth: "220px",
                  }}
                >
                  {/* Range row */}
                  <div className="flex items-center gap-4">
                    {(
                      Object.entries(RANGE_CONFIG) as [TimeRange, RangeConfig][]
                    ).map(([key, { label }]) => (
                      <button
                        key={key}
                        onClick={() => {
                          handleRangeChange(key);
                          setShowTimeframePicker(false);
                        }}
                        className="text-[9px] tracking-[0.35em] uppercase font-light transition-all duration-200"
                        style={{
                          color:
                            range === key
                              ? "rgba(255,255,255,0.80)"
                              : "rgba(255,255,255,0.25)",
                          borderBottom:
                            range === key
                              ? "1px solid rgba(255,255,255,0.40)"
                              : "1px solid transparent",
                          paddingBottom: "2px",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div
                    style={{
                      height: "1px",
                      background: "rgba(255,255,255,0.06)",
                    }}
                  />

                  {/* Interval row */}
                  <div className="flex items-center gap-4">
                    {activeIntervals.map((iv) => (
                      <button
                        key={iv}
                        onClick={() => {
                          setIntervalOverride(iv);
                          setShowTimeframePicker(false);
                        }}
                        className="text-[9px] tracking-[0.35em] uppercase font-light transition-all duration-200"
                        style={{
                          color:
                            activeInterval === iv
                              ? "rgba(255,255,255,0.80)"
                              : "rgba(255,255,255,0.25)",
                          borderBottom:
                            activeInterval === iv
                              ? "1px solid rgba(255,255,255,0.40)"
                              : "1px solid transparent",
                          paddingBottom: "2px",
                        }}
                      >
                        {INTERVAL_LABELS[iv]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: search + add-to-watchlist + hamburger */}
          <div className="flex items-center gap-4">
            <SearchBar
              onSelect={handleSelect}
              onClear={handleClear}
              selectedSymbol={selected?.symbol}
            />

            {selected &&
              (watchlistSymbols.includes(selected.symbol) ? (
                <button
                  onClick={() =>
                    removeFromWatchlist(selected.symbol)
                      .then(() => watchlistQuery.refetch())
                      .catch(() => {})
                  }
                  className="transition-opacity"
                  style={{ color: "rgba(255,255,255,0.40)" }}
                  title={`Quitar ${selected.symbol} de watchlist`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" d="M6 12h12" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() =>
                    addToWatchlist(selected.symbol)
                      .then(() => watchlistQuery.refetch())
                      .catch(() => {})
                  }
                  className="transition-opacity"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                  title={`Agregar ${selected.symbol}`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              ))}

            <button
              onClick={() => setShowWatchlist((v) => !v)}
              className="transition-opacity"
              style={{ color: "rgba(255,255,255,0.25)" }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </button>
          </div>
        </header>

        {/* ════════════════════════════════════════
          EDITORIAL CENTER: stock price only when symbol selected
      ════════════════════════════════════════ */}
        {selected && (
          <div className="absolute inset-0 flex flex-col justify-center px-7 pt-24 pb-32 z-10 pointer-events-none">
            <PriceOverlay
              label={displayLabel}
              value={displayPrice}
              change={displayChange}
              changePct={displayChangePct}
              hoverDate={hoverPoint?.date ?? null}
              size="huge"
              avgEntryPrice={
                selected && currentPosition && !hoverPoint
                  ? parseFloat(currentPosition.avg_entry_price)
                  : null
              }
            />
          </div>
        )}

        {/* ════════════════════════════════════════
          PORTFOLIO VALUE — always mounted, moves between
          center (no stock) ↔ bottom-left (stock selected)
      ════════════════════════════════════════ */}
        {portfolio.data?.account &&
          (() => {
            const liveEquity = parseFloat(
              portfolio.data?.account?.portfolio_value ?? "0",
            );
            // Use hovered value when scrubbing, otherwise live equity
            const displayEquity =
              !selected && hoverPoint ? hoverPoint.value : liveEquity;
            // Change vs period start (computed by rangeChange when !selected)
            const portChange = !selected ? rangeChange.change : null;
            const portChangePct = !selected ? rangeChange.changePct : null;
            const livePl = parseFloat(
              portfolio.data?.account?.unrealized_pl ?? "0",
            );
            // When hovering show period change, otherwise live unrealized P&L
            const shownChange =
              !selected && portChange !== null ? portChange : livePl;
            const shownChangePct =
              !selected && portChangePct !== null ? portChangePct : null;
            const up = shownChange >= 0;
            return (
              <div
                className="pointer-events-none z-20"
                style={{
                  position: "fixed",
                  left: "28px",
                  bottom: selected ? "32px" : "50%",
                  transform: selected
                    ? "translateY(0) scale(1)"
                    : "translateY(50%) scale(1)",
                  transformOrigin: "left bottom",
                  transition:
                    "bottom 0.65s cubic-bezier(0.22,1,0.36,1), transform 0.65s cubic-bezier(0.22,1,0.36,1)",
                }}
              >
                <div
                  className="flex flex-col"
                  style={{
                    gap: selected ? "2px" : "4px",
                    transition: "gap 0.65s cubic-bezier(0.22,1,0.36,1)",
                  }}
                >
                  <span
                    style={{
                      fontSize: selected ? "8px" : "9px",
                      letterSpacing: selected ? "0.5em" : "0.55em",
                      color: selected
                        ? "rgba(255,255,255,0.18)"
                        : "rgba(255,255,255,0.22)",
                      textTransform: "uppercase",
                      fontWeight: 300,
                      transition:
                        "font-size 0.65s cubic-bezier(0.22,1,0.36,1), color 0.65s cubic-bezier(0.22,1,0.36,1)",
                    }}
                  >
                    PORTAFOLIO
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: selected ? "12px" : "18px",
                        fontWeight: 300,
                        color: selected
                          ? "rgba(255,255,255,0.30)"
                          : "rgba(255,255,255,0.20)",
                        transition:
                          "font-size 0.65s cubic-bezier(0.22,1,0.36,1), color 0.65s cubic-bezier(0.22,1,0.36,1)",
                      }}
                    >
                      $
                    </span>
                    <span
                      style={{
                        fontSize: selected ? "14px" : "76px",
                        fontWeight: 100,
                        color: selected
                          ? "rgba(255,255,255,0.55)"
                          : "rgba(255,255,255,0.90)",
                        fontVariantNumeric: "tabular-nums",
                        letterSpacing: "-0.02em",
                        lineHeight: 1,
                        transition:
                          "font-size 0.65s cubic-bezier(0.22,1,0.36,1), color 0.65s cubic-bezier(0.22,1,0.36,1)",
                      }}
                    >
                      {displayEquity.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  {shownChange !== 0 && (
                    <span
                      style={{
                        fontSize: selected ? "10px" : "11px",
                        fontWeight: 300,
                        letterSpacing: selected ? "0.1em" : "0.25em",
                        color: up
                          ? selected
                            ? "rgba(255,255,255,0.35)"
                            : "rgba(255,255,255,0.55)"
                          : selected
                            ? "rgba(255,255,255,0.18)"
                            : "rgba(255,255,255,0.25)",
                        transition:
                          "font-size 0.65s cubic-bezier(0.22,1,0.36,1), color 0.65s cubic-bezier(0.22,1,0.36,1)",
                      }}
                    >
                      {up ? "+" : ""}
                      {shownChange.toFixed(2)}
                      {shownChangePct !== null &&
                        ` (${up ? "+" : ""}${shownChangePct.toFixed(2)}%)`}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

        {/* ════════════════════════════════════════
          BOTTOM FOOTER: trade controls (right)
      ════════════════════════════════════════ */}
        <footer className="absolute bottom-0 left-0 right-0 z-30 flex items-end justify-end px-7 pb-8">
          {selected ? (
            <TradeControls
              symbol={selected.symbol}
              price={basePrice}
              position={currentPosition}
              onOrderPlaced={() => positionsQuery.refetch()}
            />
          ) : null}
        </footer>
      </div>
      {/* end main chart area */}

      {/* ════════════════════════════════════════
          WATCHLIST SIDEBAR — overlay on mobile, flex child on desktop
      ════════════════════════════════════════ */}
      {/* Mobile backdrop */}
      {showWatchlist && (
        <div
          className="md:hidden fixed inset-0 z-40"
          onClick={() => setShowWatchlist(false)}
        />
      )}
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col overflow-hidden md:relative md:inset-auto md:z-auto md:h-full md:flex-shrink-0"
        style={{
          width: showWatchlist ? "288px" : "0px",
          transition: "width 0.40s cubic-bezier(0.22,1,0.36,1)",
          background: "#0e0e12",
        }}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-5 pt-6 pb-4 flex-shrink-0">
          <span
            className="text-[9px] tracking-[0.5em] uppercase font-light"
            style={{ color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap" }}
          >
            CASH
          </span>
          <button
            onClick={() => setShowWatchlist(false)}
            style={{ color: "rgba(255,255,255,0.20)" }}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <WatchlistPanel
          onSelect={(a) => handleSelect(a)}
          selectedSymbol={selected?.symbol}
          cash={
            portfolio.data?.account?.cash != null
              ? parseFloat(portfolio.data.account.cash)
              : null
          }
        />

        {/* Sign-out at bottom of sidebar */}
        <div className="flex-shrink-0 flex justify-center pb-6 pt-3">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
