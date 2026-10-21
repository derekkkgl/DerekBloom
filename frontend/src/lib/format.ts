// The one place numbers turn into text. Every screen formats through here (via <Num>),
// so rounding, separators, and symbols stay the same everywhere.

export const MISSING = "—";

const SYMBOLS: Record<string, string> = {
  USD: "$",
  PHP: "₱",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  HKD: "HK$",
  SGD: "S$",
  CAD: "C$",
  AUD: "A$",
  KRW: "₩",
  INR: "₹",
};

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? `${code} `;
}

/** Decimals that suit a price: 2 for normal prices, more for sub-dollar coins. */
export function autoDecimals(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0 || abs >= 1) return 2;
  if (abs >= 0.01) return 4;
  return 6;
}

// House style: Bitcoin is quoted in whole units (whole dollars or pesos).
const WHOLE_UNIT_SYMBOLS = new Set(["BTC", "BTC-USD"]);

/** Decimals for a price of a known symbol: whole units for BTC, otherwise autoDecimals. */
export function priceDecimals(symbol: string | null | undefined, price: number | null | undefined): number {
  if (symbol && WHOLE_UNIT_SYMBOLS.has(symbol)) return 0;
  return typeof price === "number" && Number.isFinite(price) ? autoDecimals(price) : 2;
}

const COMPACT_STEPS: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

export type FormatOptions = {
  decimals?: number; // default: autoDecimals for plain numbers, 2 for compact and percent
  compact?: boolean; // 2,813,040,486,228 -> 2.81T
  currency?: string; // ISO code, adds its symbol: $, ₱ ...
  percent?: boolean; // adds a % sign (the value is already in percent units)
  signed?: boolean; // always show + or - (for changes)
  suffix?: string; // unit after the number, e.g. "bp"
};

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function grouped(value: number, decimals: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Format a number for display. null, undefined, NaN, and infinity show as an em dash. */
export function formatNumber(value: number | null | undefined, opts: FormatOptions = {}): string {
  if (!isNumber(value)) return MISSING;

  const abs = Math.abs(value);
  let body: string;
  if (opts.compact && abs >= 1e3) {
    const [size, suffix] = COMPACT_STEPS.find(([step]) => abs >= step)!;
    body = grouped(abs / size, opts.decimals ?? 2) + suffix;
  } else {
    const decimals = opts.decimals ?? (opts.percent || opts.compact ? 2 : autoDecimals(value));
    body = grouped(abs, decimals);
  }

  // A value that rounds to zero has no sign: "0.00%", never "-0.00%".
  const roundsToZero = !/[1-9]/.test(body);
  const sign = value < 0 && !roundsToZero ? "-" : opts.signed && !roundsToZero ? "+" : "";
  const symbol = opts.currency ? currencySymbol(opts.currency) : "";
  return `${sign}${symbol}${body}${opts.percent ? "%" : ""}${opts.suffix ?? ""}`;
}

export function formatPercent(value: number | null | undefined, opts: Omit<FormatOptions, "percent"> = {}): string {
  return formatNumber(value, { ...opts, percent: true });
}

/** -1, 0, or 1 for coloring and arrows. Values that round to zero count as flat. */
export function direction(value: number | null | undefined, decimals = 2): -1 | 0 | 1 {
  if (!isNumber(value)) return 0;
  const rounded = Number(value.toFixed(decimals));
  return rounded > 0 ? 1 : rounded < 0 ? -1 : 0;
}

/** "17:41" in the viewer's local time, from an ISO timestamp. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return MISSING;
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** "24 Aug 2025" from an ISO date or timestamp. Date-only strings are read as calendar dates, not shifted by timezone. */
export function formatDate(iso: string | null | undefined, opts: { year?: boolean } = {}): string {
  if (!iso) return MISSING;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const date = new Date(dateOnly ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return MISSING;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(opts.year === false ? {} : { year: "numeric" }),
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  });
}

/** A story's time: "09:41" if it's from today, else "20 Oct". */
export function formatStamp(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return MISSING;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return MISSING;
  return date.toDateString() === now.toDateString() ? formatTime(iso) : formatDate(iso, { year: false });
}

/** Decimals that show a holding's units exactly, up to 8 (satoshis): 0.0015 -> 4, 2 -> 0. */
export function unitDecimals(units: number | null | undefined): number {
  if (typeof units !== "number" || !Number.isFinite(units)) return 0;
  const fraction = Math.abs(units).toFixed(8).replace(/0+$/, "").split(".")[1] ?? "";
  return fraction.length;
}

/** Decimals for money totals: whole pesos, dollars to the cent. */
export function moneyDecimals(currency: string | null | undefined): number {
  return currency === "PHP" ? 0 : 2;
}
