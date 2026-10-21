// Pure helpers for the portfolio screens (PORT, TXN, YLD, GOAL). No React here, so they're tested directly.

import type { Account, CashCurrency, GoalPoint, Transaction, TransactionInput, TxType, YieldSource } from "./api";

export const TX_TYPES: TxType[] = ["BUY", "SELL", "DEPOSIT", "WITHDRAW", "DIVIDEND", "REWARD", "TRANSFER"];
export const CASH_CURRENCIES: CashCurrency[] = ["PHP", "USD", "USDT"];

export function isCashCurrency(value: string): value is CashCurrency {
  return (CASH_CURRENCIES as string[]).includes(value);
}

// Window event the portfolio screens send after saving, so every panel on the page refetches.
const CHANGED = "dailytape:portfolio-changed";

export function announcePortfolioChange(): void {
  window.dispatchEvent(new Event(CHANGED));
}

export function onPortfolioChange(handler: () => void): () => void {
  window.addEventListener(CHANGED, handler);
  return () => window.removeEventListener(CHANGED, handler);
}

/** The currency an account usually trades in, as the entry row's starting choice. */
export function accountCurrency(name: string | undefined): CashCurrency {
  if (name === "Coins.ph") return "PHP";
  if (name === "Binance") return "USDT";
  return "USD";
}

/** Which inputs a transaction type uses, and what the units column means for it. */
export type TypeFields = { unitsLabel: string; asset: string; price: boolean; fee: boolean; feeCurrency: boolean; pesos: boolean };

export function typeFields(type: TxType): TypeFields {
  switch (type) {
    case "BUY":
    case "SELL":
      return { unitsLabel: "Units", asset: "Ticker", price: true, fee: true, feeCurrency: true, pesos: false };
    case "DEPOSIT":
    case "WITHDRAW":
      return { unitsLabel: "Amount", asset: "USD, USDT, PHP", price: false, fee: false, feeCurrency: false, pesos: true };
    case "DIVIDEND":
      return { unitsLabel: "Cash", asset: "Paid by", price: false, fee: false, feeCurrency: false, pesos: false };
    case "REWARD":
      return { unitsLabel: "Units", asset: "Ticker", price: true, fee: false, feeCurrency: false, pesos: false };
    case "TRANSFER":
      return { unitsLabel: "Units", asset: "Ticker", price: false, fee: true, feeCurrency: false, pesos: false };
  }
}

/** The entry row's text fields, kept as typed until saving. */
export type TxForm = {
  trade_date: string;
  account_id: string;
  type: TxType;
  asset: string;
  units: string;
  price: string;
  price_currency: CashCurrency;
  fee: string;
  fee_currency: string;
  php_amount: string;
  note: string;
};

export const NO_ACCOUNT = "No account";

/** The entry line's starting account: "No account", since picking one is optional. */
export function defaultAccount(accounts: Account[]): Account | undefined {
  return accounts.find((a) => a.name === NO_ACCOUNT) ?? accounts[0];
}

/** Accounts as the picker lists them: "No account" first, then the exchanges. */
export function accountOptions(accounts: Account[]): Account[] {
  return [...accounts.filter((a) => a.name === NO_ACCOUNT), ...accounts.filter((a) => a.name !== NO_ACCOUNT)];
}

export function emptyForm(today: string, account: Account | undefined, type: TxType = "BUY"): TxForm {
  return {
    trade_date: today,
    account_id: account ? String(account.id) : "",
    type,
    asset: "",
    units: "",
    price: "",
    price_currency: accountCurrency(account?.name),
    fee: "",
    fee_currency: "",
    php_amount: "",
    note: "",
  };
}

const text = (value: number | null) => (value === null ? "" : String(value));

export function formFromTransaction(tx: Transaction): TxForm {
  return {
    trade_date: tx.trade_date,
    account_id: String(tx.account_id),
    type: tx.type,
    asset: tx.asset,
    units: text(tx.units),
    price: text(tx.price),
    price_currency: tx.price_currency,
    fee: tx.fee ? String(tx.fee) : "",
    fee_currency: tx.fee_currency ?? "",
    php_amount: text(tx.php_amount),
    note: tx.note ?? "",
  };
}

/** "1,234.5" -> 1234.5; blank -> null. Commas are allowed because people paste them. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s₱$]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** The form as the API wants it, or the first problem to fix. Business rules stay on the backend. */
export function toInput(form: TxForm): { input: TransactionInput } | { problem: string } {
  const fields = typeFields(form.type);
  const units = parseAmount(form.units);
  const price = fields.price ? parseAmount(form.price) : null;
  const fee = fields.fee ? parseAmount(form.fee) : null;
  const pesos = fields.pesos ? parseAmount(form.php_amount) : null;

  for (const [label, value] of [[fields.unitsLabel, units], ["Price", price], ["Fee", fee], ["Pesos", pesos]] as const) {
    if (Number.isNaN(value)) return { problem: `${label} isn't a number.` };
  }
  if (!form.account_id) return { problem: "Choose an account." };
  if (!form.asset.trim()) return { problem: `Enter the ${fields.asset === "Paid by" ? "ticker that paid it" : "asset"}.` };
  if (units === null) return { problem: `Enter the ${fields.unitsLabel.toLowerCase()}.` };

  return {
    input: {
      account_id: Number(form.account_id),
      trade_date: form.trade_date,
      type: form.type,
      asset: form.asset.trim().toUpperCase(),
      units,
      price,
      price_currency: form.price_currency,
      fee: fee ?? 0,
      fee_currency: fields.feeCurrency && form.fee_currency.trim() ? form.fee_currency.trim().toUpperCase() : null,
      php_amount: pesos,
      note: form.note.trim() || null,
    },
  };
}

/** Today's date in Manila as YYYY-MM-DD, the backend's idea of "today" for trade dates. */
export function manilaToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/** A bar's width for an allocation share, kept inside 0 to 100%. */
export function barWidth(pct: number | null): string {
  const value = typeof pct === "number" && Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 100) : 0;
  return `${value.toFixed(1)}%`;
}

export function yieldSourceLabel(source: YieldSource): string {
  switch (source) {
    case "dividend":
      return "Dividend";
    case "rewards":
      return "Rewards";
    case "staking":
      return "Staking, your rate";
    case "interest":
      return "Interest, your rate";
    default:
      return "None";
  }
}

/** Projection rows as chart points: one per month, dated the 1st. */
export function projectionSeries(points: GoalPoint[], field: "capital" | "income_month" = "capital"): { time: string; value: number }[] {
  return points.map((p) => ({ time: `${p.date}-01`, value: p[field] }));
}

/** "2034-09" -> "Sep 2034". */
export function formatMonth(yearMonth: string | null): string {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) return "—";
  const [year, month] = yearMonth.split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "155 months" -> "12 years 11 months". */
export function formatDuration(months: number | null): string {
  if (months === null) return "—";
  if (months === 0) return "Reached";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [years ? `${years} ${years === 1 ? "year" : "years"}` : "", rest ? `${rest} ${rest === 1 ? "month" : "months"}` : ""];
  return parts.filter(Boolean).join(" ");
}

/** How the entry line reads for each type: "Bought 0.002 BTC on Binance". */
export const TYPE_WORDS: Record<TxType, { label: string; verb: string; linker: string }> = {
  BUY: { label: "Bought", verb: "Bought", linker: "on" },
  SELL: { label: "Sold", verb: "Sold", linker: "on" },
  REWARD: { label: "Reward", verb: "Received", linker: "as a reward on" },
  DIVIDEND: { label: "Dividend", verb: "Dividend of", linker: "on" },
  TRANSFER: { label: "Transfer", verb: "Moved", linker: "out of" },
  DEPOSIT: { label: "Deposit", verb: "Deposited", linker: "to" },
  WITHDRAW: { label: "Withdrawal", verb: "Withdrew", linker: "from" },
};

/**
 * A ledger row's total in its own currency: units × price plus the fee on a buy, minus it on
 * a sell. Dividends are their cash; deposits and withdrawals are the pesos entered. Null when
 * there's no price, or the fee is in another currency and can't be added here.
 */
export function txTotal(tx: Pick<Transaction, "type" | "units" | "price" | "price_currency" | "fee" | "fee_currency" | "asset" | "php_amount">): { value: number; currency: string } | null {
  if (tx.type === "DIVIDEND") return { value: tx.units, currency: tx.price_currency };
  if (tx.type === "DEPOSIT" || tx.type === "WITHDRAW") return tx.php_amount !== null ? { value: tx.php_amount, currency: "PHP" } : null;
  if (tx.price === null) return null;
  const gross = tx.units * tx.price;
  if (tx.type === "REWARD") return { value: gross, currency: tx.price_currency };
  if (tx.type !== "BUY" && tx.type !== "SELL") return null;
  const feeInPrice = tx.fee_currency === null || tx.fee_currency === tx.price_currency;
  const fee = feeInPrice ? tx.fee : 0;
  if (!feeInPrice && tx.fee_currency !== tx.asset) return null; // e.g. a BNB fee: the total isn't one currency
  return { value: tx.type === "BUY" ? gross + fee : gross - fee, currency: tx.price_currency };
}
