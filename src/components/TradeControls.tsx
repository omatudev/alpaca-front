import { useState, useRef, useEffect } from "react";
import { placeOrder } from "../services/api";

interface Position {
  symbol: string;
  qty: string;
  current_price?: string;
  market_value?: string;
}

interface Props {
  symbol: string;
  price: number | null;
  /** Current position for this symbol (if any) */
  position?: Position | null;
  /** Called after a successful order */
  onOrderPlaced?: () => void;
}

interface PendingOrder {
  side: "buy" | "sell";
  qty: number;
  notional: number; // USD total
  label: string; // human-readable description
}

export default function TradeControls({
  symbol,
  price,
  position,
  onOrderPlaced,
}: Props) {
  const [buyAmount, setBuyAmount] = useState("100");
  const [showSellMenu, setShowSellMenu] = useState(false);
  const [pending, setPending] = useState<PendingOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err";
    msg: string;
  } | null>(null);
  const sellRef = useRef<HTMLDivElement>(null);

  // Close sell menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sellRef.current && !sellRef.current.contains(e.target as Node)) {
        setShowSellMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Cancel pending on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPending(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Auto-clear feedback
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const posQty = position ? parseFloat(position.qty) : 0;

  const sellErrMsg = (e: any) => {
    const responseData = e?.response?.data ?? {};
    // detail can be an object (structured Alpaca error) or a string
    const detail = responseData?.detail;
    const alpacaBody: any =
      typeof detail === "object" && detail !== null
        ? detail // structured payload
        : (() => {
            if (typeof detail === "string" && detail.trim().startsWith("{")) {
              try {
                return JSON.parse(detail);
              } catch {
                /* ignore */
              }
            }
            return null;
          })();

    const code = alpacaBody?.code ?? responseData?.code;

    if (
      code === 40310100 ||
      (typeof detail === "string" && detail.includes("pattern day trading"))
    )
      return "PDT: no puedes comprar y vender el mismo día (cuenta < $25k).";

    if (code === 40310000) {
      const held = alpacaBody?.held_for_orders;
      return held
        ? `Órden pendiente bloquea ${held} acciones. Cancela la orden existente en Órdenes primero.`
        : "Qty bloqueada por una orden pendiente — cancélala primero.";
    }

    return (
      alpacaBody?.message ||
      (typeof detail === "string" ? detail : "") ||
      "Error al ejecutar"
    );
  };

  /* ── Stage buy ── */
  const stageBuy = () => {
    const usd = parseFloat(buyAmount);
    if (!usd || usd <= 0 || !price) return;
    const qty = Math.floor((usd / price) * 10000) / 10000;
    if (qty <= 0) return;
    setPending({
      side: "buy",
      qty,
      notional: usd,
      label: `COMPRAR ${qty} ${symbol} ≈ $${usd.toFixed(2)}`,
    });
    setShowSellMenu(false);
  };

  /* ── Stage sell by notional ── */
  const stageSellByAmount = () => {
    setShowSellMenu(false);
    const usd = parseFloat(buyAmount);
    if (!usd || usd <= 0 || !price) return;
    if (posQty <= 0) {
      setFeedback({ type: "err", msg: "Sin posición en este símbolo" });
      return;
    }
    const qty = Math.min(Math.floor((usd / price) * 10000) / 10000, posQty);
    if (qty <= 0) return;
    setPending({
      side: "sell",
      qty,
      notional: usd,
      label: `VENDER ${qty} ${symbol} ≈ $${usd.toFixed(2)}`,
    });
  };

  /* ── Stage sell by % ── */
  const stageSell = (pct: number) => {
    setShowSellMenu(false);
    if (posQty <= 0) {
      setFeedback({ type: "err", msg: "Sin posición en este símbolo" });
      return;
    }
    const qty = pct === 1 ? posQty : Math.floor(posQty * pct * 10000) / 10000;
    if (qty <= 0) return;
    const notional = price ? Math.round(qty * price * 100) / 100 : 0;
    const pctLabel = pct === 1 ? "TODO" : `${Math.round(pct * 100)}%`;
    setPending({
      side: "sell",
      qty,
      notional,
      label: `VENDER ${pctLabel} · ${qty} ${symbol}${notional ? ` ≈ $${notional.toFixed(2)}` : ""}`,
    });
  };

  /* ── Execute confirmed order ── */
  const executeOrder = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await placeOrder({
        symbol,
        qty: pending.qty,
        side: pending.side,
        order_type: "market",
        time_in_force: "day",
      });
      setFeedback({
        type: "ok",
        msg:
          pending.side === "buy"
            ? `✓ Compra ejecutada · ${pending.qty} ${symbol}`
            : `✓ Venta ejecutada · ${pending.qty} ${symbol}`,
      });
      onOrderPlaced?.();
    } catch (e: any) {
      setFeedback({ type: "err", msg: sellErrMsg(e) });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  /* ── Render ── */
  return (
    <div className="flex flex-col gap-2 pointer-events-auto">
      {/* ── CONFIRM ROW (replaces buy/sell when staged) ── */}
      {pending ? (
        <div className="flex items-center gap-4">
          {/* Order summary */}
          <span
            className="text-[9px] tracking-[0.25em] uppercase font-light"
            style={{
              color:
                pending.side === "buy"
                  ? "rgba(140,210,160,0.75)"
                  : "rgba(220,130,100,0.65)",
            }}
          >
            {pending.label}
          </span>

          {/* Confirm */}
          <button
            onClick={executeOrder}
            disabled={busy}
            className="text-[9px] tracking-[0.4em] uppercase font-light transition-all disabled:opacity-25 pb-0.5"
            style={{
              color:
                pending.side === "buy"
                  ? "rgba(140,210,160,0.95)"
                  : "rgba(220,130,100,0.85)",
              borderBottom:
                pending.side === "buy"
                  ? "1px solid rgba(140,210,160,0.40)"
                  : "1px solid rgba(220,130,100,0.35)",
            }}
          >
            {busy ? "..." : "CONFIRMAR"}
          </button>

          {/* Cancel */}
          <button
            onClick={() => setPending(null)}
            disabled={busy}
            className="text-[9px] tracking-[0.4em] uppercase font-light transition-all disabled:opacity-25 pb-0.5"
            style={{
              color: "rgba(255,255,255,0.22)",
              borderBottom: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            ESC
          </button>
        </div>
      ) : (
        /* ── NORMAL BUY / SELL ROW ── */
        <div>
          {/* Amount input + BUY + SELL */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center">
              <span
                className="absolute left-0 top-1/2 -translate-y-1/2 text-[10px] font-light"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                $
              </span>
              <input
                type="number"
                inputMode="decimal"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                onFocus={(e) => {
                  setTimeout(
                    () =>
                      e.target.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      }),
                    350,
                  );
                }}
                className="w-20 pl-3.5 pr-1 py-2 text-sm tabular-nums text-right focus:outline-none font-light bg-transparent"
                style={{
                  color: "rgba(255,255,255,0.70)",
                  borderBottom: "1px solid rgba(255,255,255,0.18)",
                  minHeight: "44px",
                }}
                min={1}
                step={10}
              />
            </div>

            <button
              onClick={stageBuy}
              disabled={busy}
              className="text-[9px] tracking-[0.4em] uppercase font-light transition-all disabled:opacity-25 pb-0.5 flex items-center justify-center"
              style={{
                color: "rgba(140,210,160,0.85)",
                borderBottom: "1px solid rgba(140,210,160,0.40)",
                minHeight: "44px",
                minWidth: "52px",
              }}
            >
              BUY
            </button>

            {/* Sell button + dropdown */}
            <div ref={sellRef} className="relative">
              <button
                onClick={() => setShowSellMenu((v) => !v)}
                disabled={busy || posQty <= 0}
                className="text-[9px] tracking-[0.4em] uppercase font-light transition-all disabled:opacity-20 pb-0.5 flex items-center justify-center"
                style={{
                  color: "rgba(220,130,100,0.65)",
                  borderBottom: "1px solid rgba(220,130,100,0.30)",
                  minHeight: "44px",
                  minWidth: "52px",
                }}
              >
                SELL
              </button>
              {showSellMenu && (
                <div
                  className="absolute bottom-full mb-1.5 right-0 z-50 min-w-[110px]
                              bg-[#141414] border border-white/8 backdrop-blur-xl
                              rounded-2xl overflow-hidden"
                >
                  <button
                    onClick={stageSellByAmount}
                    className="w-full px-3 py-1.5 text-left text-xs text-white/50
                             hover:bg-white/5 hover:text-white/80 transition-colors"
                  >
                    ${buyAmount}
                    <span className="text-white/20 ml-1">
                      (~
                      {price
                        ? Math.min(
                            parseFloat(buyAmount) / price,
                            posQty,
                          ).toFixed(2)
                        : "—"}
                      )
                    </span>
                  </button>
                  {[
                    { label: "40%", pct: 0.4 },
                    { label: "60%", pct: 0.6 },
                    { label: "ALL", pct: 1 },
                  ].map(({ label, pct }) => (
                    <button
                      key={label}
                      onClick={() => stageSell(pct)}
                      className="w-full px-3 py-1.5 text-left text-xs text-white/50
                               hover:bg-white/5 hover:text-white/80 transition-colors"
                    >
                      {label}
                      <span className="text-white/20 ml-1">
                        ({pct === 1 ? posQty : (posQty * pct).toFixed(2)})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Feedback toast */}
      {feedback && (
        <div
          className="text-[9px] tracking-[0.2em] font-light"
          style={{
            color:
              feedback.type === "ok"
                ? "rgba(140,210,160,0.80)"
                : "rgba(220,100,80,0.80)",
          }}
        >
          {feedback.msg}
        </div>
      )}
    </div>
  );
}
