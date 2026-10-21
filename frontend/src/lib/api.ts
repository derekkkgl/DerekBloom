// Typed client for the backend's response envelope:
//   success -> {"data": ..., "meta": {source, as_of, cached, stale}}
//   failure -> {"error": {code, message}} with a real HTTP status

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Meta = {
  source: string;
  as_of: string; // ISO UTC
  cached: boolean;
  stale: boolean;
};

export type Envelope<T> = { data: T; meta: Meta };

export class ApiError extends Error {
  constructor(
    readonly status: number, // 0 when the backend could not be reached at all
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<Envelope<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { signal, cache: "no-store" });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(0, "unreachable", `Can't reach the backend at ${API_URL}. Is it running?`);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = body?.error;
    throw new ApiError(res.status, error?.code ?? "http_error", error?.message ?? `HTTP ${res.status}`);
  }
  return body as Envelope<T>;
}

type SendMethod = "POST" | "PUT" | "DELETE";

/** Write to the backend (add, edit, delete). Errors carry the backend's own message, like apiGet. */
export async function apiSend<T>(method: SendMethod, path: string, body?: unknown): Promise<Envelope<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "unreachable", `Can't reach the backend at ${API_URL}. Is it running?`);
  }

  const parsed = await res.json().catch(() => null);
  if (!res.ok) {
    const error = parsed?.error;
    throw new ApiError(res.status, error?.code ?? "http_error", error?.message ?? `HTTP ${res.status}`);
  }
  return parsed as Envelope<T>;
}

/** Full URL of a backend path, for links such as the CSV exports Excel can open. */
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

// ---- Payload shapes (mirror backend/app/routers) ----

export type WeiRow = {
  symbol: string;
  name: string;
  region: string;
  currency: string | null; // null when the value isn't a price (DXY, yields)
  last: number | null;
  change: number | null;
  change_pct: number | null;
  ytd_pct: number | null;
  last_date: string | null;
  status: "open" | "closed";
};

export type Wei = { groups: { region: string; rows: WeiRow[] }[] };

export type CryptoGlobal = {
  market_cap_usd: number | null;
  market_cap_php: number | null;
  volume_24h_usd: number | null;
  volume_24h_php: number | null;
  market_cap_change_24h_pct: number | null;
  btc_dominance_pct: number | null;
  eth_dominance_pct: number | null;
  active_coins: number | null;
};

export type Quote = {
  input: string;
  symbol: string;
  name: string | null;
  type: string | null;
  currency: string | null;
  exchange: string | null;
  price: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  open: number | null;
  day_high: number | null;
  day_low: number | null;
  volume: number | null;
  year_high: number | null;
  year_low: number | null;
  market_cap: number | null;
  market_time: string | null;
};

export type BatchQuote = {
  input: string;
  symbol: string;
  last: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  last_date: string | null;
  closes: number[]; // about a month of daily closes, oldest first
};

export type Quotes = { quotes: BatchQuote[] };

export type Candle = {
  time: number; // Unix seconds
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  close_time: number | null; // Unix seconds the bar closes(d); null for intraday bars
};

export type ChartData = {
  symbol: string;
  currency: string | null; // what the prices are in now (PHP when converted)
  native_currency: string | null;
  converted: boolean; // true when every bar was converted at its own USD/PHP rate
  conversion_note: string | null; // how it was converted, or why it couldn't be
  range: string;
  interval: string;
  timezone: string | null; // the exchange's timezone
  last_trade: string | null; // ISO time of the latest trade
  candles: Candle[];
};

export type CryptoCoin = {
  id: string;
  ticker: string | null; // the Look up alias (BTC), or null when the coin has none yet
  symbol: string | null;
  name: string | null;
  rank: number | null;
  price_usd: number | null;
  price_php: number | null;
  change_1h_pct: number | null;
  change_24h_pct: number | null;
  change_7d_pct: number | null;
  change_1h_pct_php: number | null;
  change_24h_pct_php: number | null;
  change_7d_pct_php: number | null;
  volume_usd: number | null;
  volume_php: number | null;
  market_cap_usd: number | null;
  market_cap_php: number | null;
  sparkline_7d: number[];
  sparkline_7d_php: number[];
};

export type CryptoMarkets = { coins: CryptoCoin[] };

export type DesSecurity = {
  kind: "security";
  input: string;
  symbol: string;
  name: string | null;
  type: string | null;
  exchange: string | null;
  currency: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  website: string | null;
  employees: number | null;
  summary: string | null;
  market_cap: number | null;
  enterprise_value: number | null;
  beta: number | null;
  year_low: number | null;
  year_high: number | null;
  pe_trailing: number | null;
  pe_forward: number | null;
  price_to_book: number | null;
  price_to_sales: number | null;
  ev_to_ebitda: number | null;
  dividend_rate: number | null;
  dividend_yield_pct: number | null;
  ex_dividend_date: string | null;
  fund: { family: string | null; category: string | null; total_assets: number | null; expense_ratio_pct: number | null } | null;
};

export type DesCoin = {
  kind: "coin";
  input: string;
  id: string;
  symbol: string | null;
  name: string | null;
  rank: number | null;
  categories: string[];
  summary: string | null;
  genesis_date: string | null;
  links: { homepage: string | null; whitepaper: string | null; explorer: string | null; source: string | null };
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  price_usd: number | null;
  price_php: number | null;
  change_24h_pct: number | null;
  change_24h_pct_php: number | null;
  volume_usd: number | null;
  volume_php: number | null;
  market_cap_usd: number | null;
  market_cap_php: number | null;
  fdv_usd: number | null;
  fdv_php: number | null;
  ath_usd: number | null;
  ath_php: number | null;
  ath_date_usd: string | null;
  ath_date_php: string | null;
  from_ath_pct_usd: number | null;
  from_ath_pct_php: number | null;
};

export type Des = DesSecurity | DesCoin;

export type NewsItem = {
  title: string;
  url: string;
  source: string;
  category: "markets" | "crypto";
  published: string | null;
  summary: string | null;
};

export type NewsSource = { name: string; ok: boolean; count: number; stale: boolean; error: string | null };

export type News = { items: NewsItem[]; sources: NewsSource[] };

/** One header line for a screen that shows two responses: the older time, stale if either is. */
export function combineMeta(...metas: (Meta | null)[]): Meta | null {
  const present = metas.filter((m): m is Meta => m !== null);
  if (present.length === 0) return null;
  return {
    source: [...new Set(present.map((m) => m.source))].join(", "),
    as_of: present.map((m) => m.as_of).sort()[0],
    cached: present.every((m) => m.cached),
    stale: present.some((m) => m.stale),
  };
}

// ---- Portfolio, yield, and goal (Phase 4) ----

export type TxType = "BUY" | "SELL" | "DEPOSIT" | "WITHDRAW" | "DIVIDEND" | "REWARD" | "TRANSFER";
export type CashCurrency = "USD" | "USDT" | "PHP";

/** What the TXN entry row sends. */
export type TransactionInput = {
  account_id: number;
  trade_date: string; // YYYY-MM-DD
  type: TxType;
  asset: string;
  units: number;
  price: number | null;
  price_currency: CashCurrency;
  fee: number;
  fee_currency: string | null;
  php_amount: number | null;
  note: string | null;
};

export type Transaction = TransactionInput & {
  id: number;
  account: string;
  source: string;
  deposit_rate: number | null; // the account's average deposit rate on that date
  peso_amount: number | null; // pesos paid or received, when the database alone can tell
  yahoo_rate: boolean; // a dollar buy with no deposit before it: its peso cost uses Yahoo's rate
};

export type Account = {
  id: number;
  name: string;
  deposited_php: number;
  received_usd: number;
  avg_rate: number | null;
  first_deposit: string | null;
  last_deposit: string | null;
  cash: { currency: CashCurrency; amount: number }[];
};

export type Holding = {
  asset: string;
  name: string | null;
  class: "crypto" | "stock" | "etf" | "fund" | null;
  region: string | null;
  units: number;
  avg_cost: number;
  price: number | null;
  price_date: string | null;
  value: number | null;
  cost: number;
  pnl: number | null;
  pnl_pct: number | null;
  day_change: number | null;
  weight_pct: number | null;
  yahoo_rate: boolean;
};

export type Slice = { label: string; value: number; pct: number | null };

export type AccountFx = {
  account_id: number;
  account: string;
  deposited_php: number;
  received_usd: number;
  avg_rate: number | null;
  fx_cost_php: number | null;
  fx_cost_pct: number | null;
};

export type Portfolio = {
  currency: "PHP" | "USD";
  usd_php: number;
  usd_php_date: string | null;
  totals: {
    value: number;
    holdings_value: number;
    cash: number;
    cost: number;
    unrealized: number | null;
    unrealized_pct: number | null;
    realized: number;
    dividends: number;
    day_change: number | null;
    day_change_pct: number | null;
  };
  holdings: Holding[];
  cash: { account_id: number; account: string; currency: CashCurrency; amount: number; value: number }[];
  accounts: AccountFx[];
  allocation: { class: Slice[]; region: Slice[]; currency: Slice[] };
  warnings: string[];
};

export type YieldSource = "dividend" | "rewards" | "staking" | "interest" | null;

export type YieldRow = {
  asset: string;
  class: Holding["class"];
  units: number;
  value: number | null;
  source: YieldSource;
  dividend_per_share_usd: number | null;
  rate_pct: number | null; // the rate you set, for staking or interest
  gross_year: number;
  withheld_year: number;
  income_year: number;
  income_month: number;
  yield_pct: number | null;
};

export type YieldData = {
  currency: "PHP";
  withholding_pct: number;
  rows: YieldRow[];
  totals: {
    income_year: number;
    income_month: number;
    withheld_year: number;
    producing_value: number;
    total_value: number;
    producing_yield_pct: number | null;
    portfolio_yield_pct: number | null;
  };
  warnings: string[];
};

export type Settings = {
  target_monthly_php: number;
  contribution_monthly_php: number;
  assumed_yield_pct: number;
  withholding_pct: number;
  goal_include_all: boolean | number;
};

export type GoalPoint = { month: number; date: string; capital: number; income_month: number };

export type Goal = {
  settings: Settings;
  income_now_month: number;
  income_now_year: number;
  progress_pct: number;
  if_converted_month: number;
  total_value: number;
  producing_value: number;
  start_capital: number;
  capital_needed: number | null;
  capital_gap: number | null;
  months_to_goal: number | null;
  target_date: string | null; // YYYY-MM
  reachable: boolean;
  note: string | null;
  projection: GoalPoint[];
};
