import {
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useState,
  useMemo,
} from "react";

/**
 * Candlestick chart with TradingView-style navigation.
 *
 * Interaction model (matches TradingView exactly):
 *
 *   MOUSE WHEEL (vertical)
 *     No modifier  -> pan left/right (scroll down = forward in time)
 *     Ctrl / Meta  -> zoom in/out centred on cursor
 *
 *   TRACKPAD
 *     Two-finger horizontal swipe -> pan (uses deltaX)
 *     Pinch                       -> zoom (browser sends ctrlKey + deltaY)
 *
 *   MOUSE DRAG
 *     Click + drag -> pan (grab)
 *
 *   DOUBLE-CLICK -> reset to full view
 *
 * Design principles:
 *   - Pan is DIRECT (no lerp/animation). 1:1 with input. Feels immediate.
 *   - Zoom is multiplicative per pixel (ZOOM_BASE ^ delta). Feels proportional.
 *   - Y axis auto-scales to visible price range.
 *   - Minimap shows position when zoomed.
 */

// -- Layout constants ---------------------------------------------------
const W = 1000;
const H = 400;
const PAD_Y = 0.12;
const PAD_X = 20;
const FLATTEN_IN = 200; // scaleY 1→0 (ease-in)
const FLATTEN_OUT = 300; // scaleY 0→1 (ease-out)
const BODY_RATIO = 0.72;
const MAX_BODY_W = 36; // never wider than this (prevents giant candles with few bars)

// -- Interaction tuning -------------------------------------------------
const MIN_VISIBLE = 4;
const ZOOM_BASE = 1.004; // per normalised pixel of scroll delta
const PAN_BARS_PER_PX = 0.15; // bars panned per pixel of scroll delta

// -- Types --------------------------------------------------------------
export interface Bar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}
export interface HoverPoint {
  value: number;
  date: string;
  periodFirst: number;
}
interface Props {
  bars: Bar[];
  lastPrice?: number | null;
  dataKey?: string;
  onHoverPoint?: (point: HoverPoint | null) => void;
  /** Reserve this many total slots on X axis (fills right side with empty space) */
  expectedBars?: number;
}

// -- Palette -------------------------------------------------------------
const UP_FILL = "rgba(90,185,125,0.70)"; // muted green — up body
const UP_WICK = "rgba(90,185,125,0.42)"; // muted green — up wicks
const DN_FILL = "rgba(205,90,85,0.62)"; // muted red — down body
const DN_WICK = "rgba(205,90,85,0.38)"; // muted red — down wicks
const EXT_UP_FILL = "rgba(90,185,125,0.20)"; // dim green — extended up
const EXT_DN_FILL = "rgba(205,90,85,0.16)"; // dim red — extended down
const EXT_WICK_DIM = "rgba(255,255,255,0.10)"; // dim wicks — extended hours

// -- Extended-hours detection ------------------------------------------
// Regular NYSE session: 9:30 AM–4:00 PM ET.
// In UTC: EST (winter) = 14:30–21:00 | EDT (summer) = 13:30–20:00
// Using 13:30–21:00 UTC as inclusive window (slight over-include is fine).
function isExtendedHours(iso: string): boolean {
  const d = new Date(iso);
  const utcMins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return utcMins < 13 * 60 + 30 || utcMins >= 21 * 60;
}

// -- Pure helpers -------------------------------------------------------
function priceToY(price: number, lo: number, range: number) {
  return H - (((price - lo) / range) * H * (1 - 2 * PAD_Y) + H * PAD_Y);
}

function fmtDate(iso: string, intraday: boolean) {
  const d = new Date(iso);
  return intraday
    ? d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

// -- Candle geometry ----------------------------------------------------
interface Candle {
  x: number;
  wickX: number;
  wickY1: number;
  wickY2: number;
  bodyY: number;
  bodyH: number;
  bodyW: number;
  isUp: boolean;
  isExtended: boolean;
}

function buildCandles(
  bars: Bar[],
  lo: number,
  range: number,
  totalSlots: number,
): Candle[] {
  const n = bars.length;
  if (!n) return [];
  const usable = W - PAD_X * 2;
  const slot = usable / totalSlots;
  const bw = Math.min(MAX_BODY_W, Math.max(1, slot * BODY_RATIO));

  return bars.map((b, i) => {
    const cx = PAD_X + (i + 0.5) * slot;
    const up = b.close >= b.open;
    const top = up ? b.close : b.open;
    const bot = up ? b.open : b.close;
    const by = priceToY(top, lo, range);
    const bby = priceToY(bot, lo, range);
    return {
      x: cx - bw / 2,
      wickX: cx,
      wickY1: priceToY(b.high, lo, range),
      wickY2: priceToY(b.low, lo, range),
      bodyY: by,
      bodyH: Math.max(1, bby - by),
      bodyW: bw,
      isUp: up,
      isExtended: isExtendedHours(b.timestamp),
    };
  });
}

// -- Clamp helper -------------------------------------------------------
function clampView(s: number, e: number, total: number) {
  const vis = e - s;
  let ns = s,
    ne = e;
  if (ns < 0) {
    ne -= ns;
    ns = 0;
  }
  if (ne > total) {
    ns -= ne - total;
    ne = total;
  }
  return { s: Math.max(0, ns), e: Math.min(total, ne), vis };
}

// -- Normalise scroll delta across devices/browsers ---------------------
function normaliseDelta(raw: number, mode: number): number {
  let d = raw;
  if (mode === 1) d *= 40; // DOM_DELTA_LINE
  if (mode === 2) d *= 800; // DOM_DELTA_PAGE
  return d;
}

// =======================================================================
// Component
// =======================================================================
export default function BackgroundChart({
  bars,
  lastPrice,
  dataKey,
  onHoverPoint,
  expectedBars,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ idx: number } | null>(null);
  const lastHoverIdx = useRef<number | null>(null);
  const isIntraday = useRef(false);

  // Flatten/unflatten animation refs
  const candleGroupRef = useRef<SVGGElement>(null);
  const prevDataKey = useRef<string | undefined>(undefined);
  const prevTotal = useRef(0);
  const flattenTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingUnflatten = useRef(false);
  const flattenStartTime = useRef(0);

  // Keep last non-empty candles visible while bars=[] (during source transition)
  const prevCandlesRef = useRef<Candle[]>([]);

  // View window (fractional bar indices)
  const [vs, setVs] = useState(0);
  const [ve, setVe] = useState(0);

  // Drag state
  const drag = useRef({ active: false, x0: 0, vs0: 0, ve0: 0 });

  // -- Live bars (merge realtime price into last candle) ----------------
  // Only update the last bar in-place reference to avoid re-creating the
  // entire array on every WebSocket tick (which cascades through visible → candles → SVG).
  const liveBars = useMemo<Bar[]>(() => {
    if (!bars.length || lastPrice == null) return bars;
    const last = bars[bars.length - 1];
    // If close already matches, skip allocation entirely
    if (
      last.close === lastPrice &&
      last.high >= lastPrice &&
      last.low <= lastPrice
    )
      return bars;
    const updated: Bar = {
      ...last,
      close: lastPrice,
      high: Math.max(last.high, lastPrice),
      low: Math.min(last.low, lastPrice),
    };
    // Reuse the same prefix, only replace last element
    const copy = bars.slice(0, -1);
    copy.push(updated);
    return copy;
  }, [bars, lastPrice]);

  const total = liveBars.length;
  // Virtual slot count: reserves empty space on right for expected future bars
  const totalSlotsForView = Math.max(total, expectedBars ?? 0);

  // =================================================================
  // Flatten / unflatten: scaleY(1→0→1) on the candle <g>.
  //
  // Key invariant: the unflatten only fires when bars for the NEW
  // dataKey have actually arrived — never on a fixed timeout.
  // prevCandlesRef keeps old candles rendered while bars=[] so the
  // flatten animation has something visible to squish.
  // =================================================================
  useLayoutEffect(() => {
    const g = candleGroupRef.current;
    if (!g) return;

    const prevDK = prevDataKey.current;
    const prevN = prevTotal.current;
    prevDataKey.current = dataKey;
    prevTotal.current = bars.length;

    const isFirst = prevDK == null;
    const isDifferentSource = !isFirst && prevDK !== dataKey;
    const hasData = bars.length > 0;

    // Helper: play the grow-from-flat animation
    const unflatten = () => {
      setVs(0);
      setVe(totalSlotsForView);
      requestAnimationFrame(() => {
        g.style.transition = `transform ${FLATTEN_OUT}ms ease-out`;
        g.style.transform = "scaleY(1)";
      });
    };

    if (isFirst) {
      if (!hasData) {
        // Don't advance prevDataKey yet — retry when data arrives
        prevDataKey.current = undefined;
        return;
      }
      g.style.transition = "none";
      g.style.transform = "scaleY(0)";
      unflatten();
      return;
    }

    if (isDifferentSource) {
      clearTimeout(flattenTimer.current);
      // Flatten immediately (old candles visible via prevCandlesRef)
      g.style.transition = `transform ${FLATTEN_IN}ms ease-in`;
      g.style.transform = "scaleY(0)";

      if (hasData) {
        // Cache hit: data already here — unflatten after the ease-in finishes
        flattenTimer.current = setTimeout(() => unflatten(), FLATTEN_IN);
      } else {
        // Data still loading — set flag, unflatten comes from the branch below
        pendingUnflatten.current = true;
        flattenStartTime.current = Date.now();
      }
      return;
    }

    // Same dataKey -------------------------------------------------
    if (pendingUnflatten.current) {
      if (!hasData) return; // still loading
      // New bars finally arrived — wait only the remaining flatten duration, then grow
      pendingUnflatten.current = false;
      clearTimeout(flattenTimer.current);
      const elapsed = Date.now() - flattenStartTime.current;
      const remaining = Math.max(0, FLATTEN_IN - elapsed);
      flattenTimer.current = setTimeout(() => unflatten(), remaining);
      return;
    }

    // Normal periodic refresh: when new bars arrive, keep the view anchored
    // to the right edge (so new candles appear on the right) instead of
    // advancing the left edge and dropping the first visible candle.
    if (hasData) {
      const added = bars.length - prevN;
      if (added !== 0) {
        const slots = totalSlotsForView;
        // current visible slot count (integer)
        const vis = Math.max(
          1,
          Math.ceil(stateRef.current.ve) - Math.floor(stateRef.current.vs),
        );
        // Only auto-anchor when there aren't many slots, or when the user
        // was already at the right edge. This prevents forcing an anchor when
        // the user has scrolled back into historical data.
        const AUTO_ANCHOR_MAX_SLOTS = 120;
        const wasAtRightEdge =
          Math.ceil(stateRef.current.ve) >= Math.max(0, slots - 1);
        if (slots <= AUTO_ANCHOR_MAX_SLOTS || wasAtRightEdge) {
          const newVe = slots;
          const newVs = Math.max(0, newVe - vis);
          setVs(newVs);
          setVe(newVe);
        }
      }
    }

    return () => clearTimeout(flattenTimer.current);
  }, [bars, dataKey]);

  useEffect(() => {
    isIntraday.current = bars.length > 50;
  }, [bars.length]);

  // -- Visible slice ----------------------------------------------------
  const visible = useMemo(() => {
    if (!total) return [];
    return liveBars.slice(
      Math.max(0, Math.floor(vs)),
      Math.min(total, Math.ceil(ve)),
    );
  }, [liveBars, total, vs, ve]);

  // Price range for visible slice
  const { lo, range } = useMemo(() => {
    if (!visible.length) return { lo: 0, range: 1 };
    let mn = Infinity,
      mx = -Infinity;
    for (const b of visible) {
      if (b.low < mn) mn = b.low;
      if (b.high > mx) mx = b.high;
    }
    const r = mx - mn || 1;
    // Use a slightly larger vertical padding and center the visible range
    // around the midpoint so extreme wicks don't dominate the visual.
    const PAD_MULT = 1.2; // expand range by 20%
    const expanded = r * PAD_MULT;
    const mid = (mx + mn) / 2;
    const loVal = mid - expanded / 2;
    return { lo: loVal, range: expanded };
  }, [visible]);

  const candles = useMemo(
    () =>
      buildCandles(
        visible,
        lo,
        range,
        Math.max(Math.ceil(ve) - Math.floor(vs), visible.length),
      ),
    [visible, lo, range, vs, ve],
  );

  // Always render the last non-empty candles — keeps old chart visible while
  // bars=[] during a source transition (so the flatten actually shows something)
  if (candles.length > 0) prevCandlesRef.current = candles;
  const displayCandles = candles.length > 0 ? candles : prevCandlesRef.current;

  const isZoomed =
    total > 0 && (Math.floor(vs) > 0 || Math.ceil(ve) < totalSlotsForView);

  // -- Ref for wheel handler (avoids re-attaching listener) -------------
  const stateRef = useRef({ vs: 0, ve: 0, total: 0, totalSlots: 0 });
  stateRef.current = { vs, ve, total, totalSlots: totalSlotsForView };

  // =====================================================================
  // WHEEL: pan + zoom (native listener, { passive: false })
  // =====================================================================
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { vs: s, ve: en, totalSlots: t } = stateRef.current;
      if (t < 2) return;

      const curVis = en - s;

      // Pinch-to-zoom on trackpad sends ctrlKey.
      // Ctrl+wheel on mouse also sends ctrlKey.
      const isZoom = e.ctrlKey || e.metaKey;

      if (isZoom) {
        // --- ZOOM centred on cursor ---
        const dy = normaliseDelta(e.deltaY, e.deltaMode);
        const rect = el.getBoundingClientRect();
        const anchor = (e.clientX - rect.left) / rect.width; // 0..1

        // Multiplicative: positive dy = zoom out (show more bars)
        const factor = Math.pow(ZOOM_BASE, dy);
        let newVis = curVis * factor;
        newVis = Math.max(MIN_VISIBLE, Math.min(t, newVis));

        const diff = newVis - curVis;
        const c = clampView(s - diff * anchor, en + diff * (1 - anchor), t);
        setVs(c.s);
        setVe(c.e);
      } else {
        // --- PAN through time ---
        // Use deltaX if available (trackpad horizontal swipe).
        // Fall back to deltaY (mouse wheel vertical → horizontal pan).
        const raw =
          Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const d = normaliseDelta(raw, e.deltaMode);

        // Convert px delta to number of bars to shift
        const shift = d * PAN_BARS_PER_PX;

        const c = clampView(s + shift, en + shift, t);
        setVs(c.s);
        setVe(c.e);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []); // stable — reads from stateRef

  // =====================================================================
  // MOUSE: drag-to-pan + crosshair hover
  // =====================================================================
  const onDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      drag.current = { active: true, x0: e.clientX, vs0: vs, ve0: ve };
    },
    [vs, ve],
  );

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      const d = drag.current;
      if (!containerRef.current || total < 2) return;

      if (d.active) {
        // Drag-to-pan
        const rect = containerRef.current.getBoundingClientRect();
        const pxDelta = e.clientX - d.x0;
        const vis = d.ve0 - d.vs0;
        const shift = -(pxDelta / rect.width) * vis;

        const c = clampView(d.vs0 + shift, d.ve0 + shift, totalSlotsForView);
        setVs(c.s);
        setVe(c.e);
        return;
      }

      // Crosshair hover — map mouse X to candle index using same coords as SVG
      const rect = containerRef.current.getBoundingClientRect();
      const xPct = (e.clientX - rect.left) / rect.width; // 0..1 in container
      const n = visible.length;
      if (n < 1) return;

      // SVG coordinate the mouse maps to (0..W)
      const svgX = xPct * W;
      // Candles span from PAD_X to W-PAD_X, each slot is usable/n wide
      const usable = W - PAD_X * 2;
      const slotIdx = (svgX - PAD_X) / (usable / n) - 0.5;
      const idx = Math.max(0, Math.min(n - 1, Math.round(slotIdx)));

      // Skip re-render if same candle
      if (lastHoverIdx.current === idx) return;
      lastHoverIdx.current = idx;

      setHover({ idx });
      onHoverPoint?.({
        value: visible[idx].close,
        date: fmtDate(visible[idx].timestamp, isIntraday.current),
        periodFirst: liveBars[0].open,
      });
    },
    [total, visible, liveBars, onHoverPoint],
  );

  const onUp = useCallback(() => {
    drag.current.active = false;
  }, []);

  const onLeave = useCallback(() => {
    drag.current.active = false;
    setHover(null);
    lastHoverIdx.current = null;
    onHoverPoint?.(null);
  }, [onHoverPoint]);

  const onDblClick = useCallback(() => {
    setVs(0);
    setVe(totalSlotsForView);
  }, [totalSlotsForView]);

  // -- Crosshair — use exact candle centre formula ----------------------
  const crossPct =
    hover && visible.length > 0
      ? ((PAD_X + ((hover.idx + 0.5) * (W - PAD_X * 2)) / visible.length) / W) *
        100
      : 0;
  const crossColor = "#ffffff";

  // -- Minimap ----------------------------------------------------------
  const mmLeft = total ? (vs / total) * 100 : 0;
  const mmW = total ? ((ve - vs) / total) * 100 : 100;

  // -- Render -----------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onLeave}
      onDoubleClick={onDblClick}
      style={{
        cursor: drag.current.active ? "grabbing" : undefined,
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-full pointer-events-none"
      >
        {/* Neon glow filter */}
        <defs>
          <filter id="neon" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation="2"
              result="blur1"
            />
            <feMerge>
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Candle group — flatten/unflatten via scaleY */}
        <g
          ref={candleGroupRef}
          style={{ transformOrigin: "50% 50%", transform: "scaleY(0)" }}
        >
          {/* Down candles regular */}
          <g>
            {displayCandles.map((c, i) => {
              if (c.isUp || c.isExtended) return null;
              const sw = Math.max(1, c.bodyW * 0.15);
              const rx = Math.max(2, c.bodyW * 0.32);
              return (
                <g key={i}>
                  <line
                    x1={c.wickX}
                    y1={c.wickY1}
                    x2={c.wickX}
                    y2={c.bodyY}
                    stroke={DN_WICK}
                    strokeWidth={sw}
                    strokeLinecap="round"
                  />
                  <line
                    x1={c.wickX}
                    y1={c.bodyY + c.bodyH}
                    x2={c.wickX}
                    y2={c.wickY2}
                    stroke={DN_WICK}
                    strokeWidth={sw}
                    strokeLinecap="round"
                  />
                  <rect
                    x={c.x}
                    y={c.bodyY}
                    width={c.bodyW}
                    height={c.bodyH}
                    fill={DN_FILL}
                    rx={rx}
                  />
                </g>
              );
            })}
          </g>
          {/* Down candles extended-hours */}
          <g>
            {displayCandles.map((c, i) => {
              if (c.isUp || !c.isExtended) return null;
              const sw = Math.max(1, c.bodyW * 0.12);
              const rx = Math.max(2, c.bodyW * 0.32);
              return (
                <g key={i}>
                  <line
                    x1={c.wickX}
                    y1={c.wickY1}
                    x2={c.wickX}
                    y2={c.bodyY}
                    stroke={EXT_WICK_DIM}
                    strokeWidth={sw}
                    strokeLinecap="round"
                  />
                  <line
                    x1={c.wickX}
                    y1={c.bodyY + c.bodyH}
                    x2={c.wickX}
                    y2={c.wickY2}
                    stroke={EXT_WICK_DIM}
                    strokeWidth={sw}
                    strokeLinecap="round"
                  />
                  <rect
                    x={c.x}
                    y={c.bodyY}
                    width={c.bodyW}
                    height={c.bodyH}
                    fill={EXT_DN_FILL}
                    rx={rx}
                  />
                </g>
              );
            })}
          </g>
          {/* Up candles regular */}
          <g>
            {displayCandles.map((c, i) => {
              if (!c.isUp || c.isExtended) return null;
              const sw = Math.max(1, c.bodyW * 0.15);
              const rx = Math.max(2, c.bodyW * 0.32);
              return (
                <g key={i}>
                  <line
                    x1={c.wickX}
                    y1={c.wickY1}
                    x2={c.wickX}
                    y2={c.bodyY}
                    stroke={UP_WICK}
                    strokeWidth={sw}
                    strokeLinecap="round"
                  />
                  <line
                    x1={c.wickX}
                    y1={c.bodyY + c.bodyH}
                    x2={c.wickX}
                    y2={c.wickY2}
                    stroke={UP_WICK}
                    strokeWidth={sw}
                    strokeLinecap="round"
                  />
                  <rect
                    x={c.x}
                    y={c.bodyY}
                    width={c.bodyW}
                    height={c.bodyH}
                    fill={UP_FILL}
                    rx={rx}
                  />
                </g>
              );
            })}
          </g>
          {/* Up candles extended-hours */}
          <g>
            {displayCandles.map((c, i) => {
              if (!c.isUp || !c.isExtended) return null;
              const sw = Math.max(1, c.bodyW * 0.12);
              const rx = Math.max(2, c.bodyW * 0.32);
              return (
                <g key={i}>
                  <line
                    x1={c.wickX}
                    y1={c.wickY1}
                    x2={c.wickX}
                    y2={c.bodyY}
                    stroke={EXT_WICK_DIM}
                    strokeWidth={sw}
                    strokeLinecap="round"
                  />
                  <line
                    x1={c.wickX}
                    y1={c.bodyY + c.bodyH}
                    x2={c.wickX}
                    y2={c.wickY2}
                    stroke={EXT_WICK_DIM}
                    strokeWidth={sw}
                    strokeLinecap="round"
                  />
                  <rect
                    x={c.x}
                    y={c.bodyY}
                    width={c.bodyW}
                    height={c.bodyH}
                    fill={EXT_UP_FILL}
                    rx={rx}
                  />
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Crosshair */}
      {hover && !drag.current.active && visible.length > 1 && (
        <div
          className="absolute top-0 bottom-0 w-px opacity-25 pointer-events-none"
          style={{
            left: `${crossPct}%`,
            backgroundColor: crossColor,
          }}
        />
      )}

      {/* Minimap */}
      {isZoomed && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-24 h-0.5 rounded-full bg-white/8 pointer-events-none">
          <div
            className="absolute top-0 h-full rounded-full bg-white/30"
            style={{ left: `${mmLeft}%`, width: `${mmW}%` }}
          />
        </div>
      )}
    </div>
  );
}
