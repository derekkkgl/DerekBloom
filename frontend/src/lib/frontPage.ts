// The front page's lists, in one place. Edit these to change what Home shows.
// (An editable watchlist arrives later; until then this file is the watchlist.)

export const US_LIST = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "VOO", name: "Vanguard S&P 500" },
  { symbol: "QQQ", name: "Invesco QQQ" },
  { symbol: "VT", name: "Vanguard Total World" },
];

/** Coins by their Look up ticker (the backend's aliases). */
export const CRYPTO_LIST = ["BTC", "ETH", "XRP", "SOL", "BNB", "ADA", "DOGE"];

/** World indices by Yahoo symbol, with short labels for the narrow column. */
export const INDEX_LIST = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^DJI", label: "Dow" },
  { symbol: "^FTSE", label: "FTSE 100" },
  { symbol: "^GDAXI", label: "DAX" },
  { symbol: "^N225", label: "Nikkei 225" },
  { symbol: "^HSI", label: "Hang Seng" },
  { symbol: "^STI", label: "STI" },
];

export const HEADLINE_COUNT = 8;

export function quotesPath(symbols: string[]): string {
  return `/api/quotes?symbols=${symbols.map(encodeURIComponent).join(",")}`;
}

/** Items in the order of `keys`; a key with no match gives undefined, so its row still shows (with dashes). */
export function pickInOrder<T>(items: T[] | null | undefined, keys: string[], keyOf: (item: T) => string | null): (T | undefined)[] {
  const byKey = new Map<string, T>();
  for (const item of items ?? []) {
    const key = keyOf(item);
    if (key !== null && !byKey.has(key)) byKey.set(key, item);
  }
  return keys.map((key) => byKey.get(key));
}
