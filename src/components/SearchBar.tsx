import { useState, useRef, useEffect } from "react";
import { searchAssets } from "../services/api";

interface Asset {
  symbol: string;
  name: string;
  exchange?: string;
  asset_class?: string;
  tradable?: boolean;
}

interface Props {
  onSelect: (asset: Asset) => void;
  onClear: () => void;
  selectedSymbol?: string | null;
}

export default function SearchBar({
  onSelect,
  onClear,
  selectedSymbol,
}: Props) {
  const [query, setQuery] = useState(selectedSymbol ?? "");
  const [results, setResults] = useState<Asset[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external selectedSymbol → input value (shows ticker when asset loaded)
  const prevSymbol = useRef(selectedSymbol);
  useEffect(() => {
    if (selectedSymbol !== prevSymbol.current) {
      prevSymbol.current = selectedSymbol;
      setQuery(selectedSymbol ?? "");
      setOpen(false);
      setResults([]);
    }
  }, [selectedSymbol]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Space key → focus search (when not already in an input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const doSearch = (q: string) => {
    if (q.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    searchAssets(q)
      .then((data: Asset[]) => {
        setResults(data.slice(0, 8));
        setActiveIndex(-1);
        setOpen(true);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  };

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value === "") {
      setResults([]);
      setOpen(false);
      onClear();
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleSelect = (asset: Asset) => {
    setQuery(asset.symbol); // keep ticker in input
    setResults([]);
    setOpen(false);
    onSelect(asset);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    onClear();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIndex] ?? results[0];
      if (target) handleSelect(target);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const isEmpty = !query;

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      {/* Input row */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="BUSCA UN TICKER"
          className={`py-1 rounded-none text-[9px] tracking-[0.45em] uppercase font-light
            focus:outline-none transition-all
            ${
              isEmpty
                ? "pr-3 bg-transparent placeholder:text-white/40"
                : "pr-7 bg-transparent"
            }`}
          style={{
            width: "140px",
            color: isEmpty
              ? "rgba(255,255,255,0.40)"
              : "rgba(255,255,255,0.70)",
          }}
        />

        {/* Spinner */}
        {loading && (
          <div className="absolute right-7 top-1/2 -translate-y-1/2 w-2.5 h-2.5 border border-white/15 border-t-white/50 rounded-full animate-spin" />
        )}

        {/* X clear button */}
        {!isEmpty && (
          <button
            onClick={handleClear}
            className="absolute right-1 top-1/2 -translate-y-1/2 transition-colors"
            style={{ color: "rgba(255,255,255,0.25)" }}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown — solo ticker */}
      {open && results.length > 0 && (
        <div
          className="absolute top-full mt-2 left-0 z-50
                      bg-[#121212] border border-white/8
                      rounded-2xl overflow-hidden"
          style={{ minWidth: "100%" }}
        >
          {results.map((asset, idx) => (
            <button
              key={asset.symbol}
              onClick={() => handleSelect(asset)}
              className={`w-full px-4 py-2 text-left font-medium text-xs
                         transition-colors border-b border-white/3 last:border-0
                         ${
                           idx === activeIndex
                             ? "bg-white/8 text-white/90"
                             : "text-white/70 hover:bg-white/6"
                         }`}
            >
              {asset.symbol}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
