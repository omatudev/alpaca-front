import NumberFlow from "@number-flow/react";

interface Props {
  /** e.g. "AAPL" or "Mi Portafolio" */
  label: string;
  /** Current price / portfolio value */
  value: number | null;
  /** Absolute change */
  change?: number | null;
  /** Percentage change */
  changePct?: number | null;
  /** Date string shown on hover */
  hoverDate?: string | null;
  /** "light" = dark text on white bg, "dark" = white text (default) */
  variant?: "light" | "dark";
  /** "huge" = editorial massive type (MADE-style), "normal" = default */
  size?: "normal" | "huge";
  /** Average entry price — shown below main price in huge mode */
  avgEntryPrice?: number | null;
}

export default function PriceOverlay({
  label,
  value,
  change,
  changePct,
  hoverDate,
  variant = "dark",
  size = "normal",
  avgEntryPrice,
}: Props) {
  const isPositive = (change ?? 0) >= 0;
  const isLight = variant === "light";
  const isHuge = size === "huge";

  if (isHuge) {
    return (
      <div className="flex flex-col gap-2 select-none pointer-events-none">
        {/* Hover date or symbol label */}
        <span
          className="text-[9px] tracking-[0.55em] uppercase font-light"
          style={{ color: "rgba(255,255,255,0.22)" }}
        >
          {hoverDate ?? label}
        </span>

        {/* Massive price — like MADE’s wordmark */}
        <div className="flex items-baseline leading-none">
          <span
            className="text-2xl font-thin mr-2"
            style={{ color: "rgba(255,255,255,0.20)" }}
          >
            $
          </span>
          {value !== null ? (
            <NumberFlow
              value={value}
              format={{
                style: "decimal",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }}
              transformTiming={{ duration: 500, easing: "ease-out" }}
              spinTiming={{ duration: 500, easing: "ease-out" }}
              className="text-[76px] font-thin tracking-tight leading-none text-white"
            />
          ) : (
            <span
              className="text-[76px] font-thin leading-none"
              style={{ color: "rgba(255,255,255,0.12)" }}
            >
              —
            </span>
          )}
        </div>

        {/* Change row */}
        {change != null && (
          <div
            className="flex items-center gap-2 text-[11px] tracking-[0.25em] font-light"
            style={{
              color: isPositive
                ? "rgba(140,210,160,0.85)"
                : "rgba(220,130,100,0.70)",
            }}
          >
            <span>{isPositive ? "▲" : "▼"}</span>
            <NumberFlow
              value={change}
              format={{
                style: "decimal",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
                signDisplay: "always",
              }}
              transformTiming={{ duration: 400, easing: "ease-out" }}
              spinTiming={{ duration: 400, easing: "ease-out" }}
            />
            {changePct != null && (
              <span
                style={{
                  color: isPositive
                    ? "rgba(255,255,255,0.35)"
                    : "rgba(255,255,255,0.18)",
                }}
              >
                ({changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%)
              </span>
            )}
          </div>
        )}

        {/* Avg entry price — fixed-height container so it never shifts layout */}
        <div style={{ height: "26px", overflow: "hidden" }}>
          <NumberFlow
            value={avgEntryPrice ?? 0}
            format={{
              style: "decimal",
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }}
            transformTiming={{ duration: 500, easing: "ease-out" }}
            spinTiming={{ duration: 500, easing: "ease-out" }}
            className="tabular-nums font-thin leading-none"
            style={{
              fontSize: "18px",
              letterSpacing: "-0.01em",
              color: "rgba(255,255,255,0.85)",
              opacity: avgEntryPrice != null ? 1 : 0,
              transition: "opacity 300ms ease",
            }}
          />
        </div>
      </div>
    );
  }

  // — Normal (original) layout —
  return (
    <div className="flex flex-col items-center gap-0.5 select-none pointer-events-none">
      {/* Hover date */}
      <span
        className={`text-[11px] h-4 tracking-wide ${
          hoverDate
            ? isLight
              ? "text-black/35"
              : "text-white/30"
            : "invisible"
        }`}
      >
        {hoverDate || "\u00A0"}
      </span>

      {/* Symbol / Label */}
      <span
        className={`text-xs font-semibold tracking-[0.25em] uppercase ${
          isLight ? "text-black/40" : "text-white/40"
        }`}
      >
        {label}
      </span>

      {/* Big price */}
      <div
        className={`text-5xl font-extralight leading-none mt-1 ${
          isLight ? "text-black" : "text-white"
        }`}
      >
        {value !== null ? (
          <span className="inline-flex items-baseline gap-1.5">
            <span
              className={`text-2xl ${isLight ? "opacity-20" : "opacity-25"}`}
            >
              $
            </span>
            <NumberFlow
              value={value}
              format={{
                style: "decimal",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }}
              transformTiming={{ duration: 500, easing: "ease-out" }}
              spinTiming={{ duration: 500, easing: "ease-out" }}
            />
          </span>
        ) : (
          <span className="opacity-20">—</span>
        )}
      </div>

      {/* Change */}
      {change !== null && change !== undefined && (
        <div
          className="text-sm font-medium flex items-center gap-1 mt-1"
          style={
            isLight
              ? { color: isPositive ? "rgba(0,0,0,0.80)" : "rgba(0,0,0,0.35)" }
              : {
                  color: isPositive
                    ? "rgba(140,210,160,0.85)"
                    : "rgba(220,130,100,0.70)",
                }
          }
        >
          <span className="text-[10px]">{isPositive ? "▲" : "▼"}</span>
          <NumberFlow
            value={change}
            format={{
              style: "decimal",
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
              signDisplay: "always",
            }}
            transformTiming={{ duration: 400, easing: "ease-out" }}
            spinTiming={{ duration: 400, easing: "ease-out" }}
          />
          {changePct !== null && changePct !== undefined && (
            <span className="opacity-60 inline-flex items-center">
              (
              <NumberFlow
                value={changePct / 100}
                format={{
                  style: "percent",
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                  signDisplay: "always",
                }}
                transformTiming={{ duration: 400, easing: "ease-out" }}
                spinTiming={{ duration: 400, easing: "ease-out" }}
              />
              )
            </span>
          )}
        </div>
      )}
    </div>
  );
}
