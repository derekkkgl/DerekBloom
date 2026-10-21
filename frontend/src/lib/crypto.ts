// What a coin row shows in the chosen display currency. Peso figures come from
// CoinGecko's own PHP data (price, changes, volume, sparkline), never our FX math.

import type { CryptoCoin } from "./api";
import type { DisplayCurrency } from "./currency";

export type CoinView = {
  currency: DisplayCurrency; // what the row is actually in (USD if pesos are missing)
  price: number | null;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  volume: number | null;
  marketCap: number | null;
  sparkline: number[];
};

export function coinView(coin: CryptoCoin, wanted: DisplayCurrency): CoinView {
  if (wanted === "PHP" && coin.price_php !== null) {
    return {
      currency: "PHP",
      price: coin.price_php,
      change1h: coin.change_1h_pct_php,
      change24h: coin.change_24h_pct_php,
      change7d: coin.change_7d_pct_php,
      volume: coin.volume_php,
      marketCap: coin.market_cap_php,
      sparkline: coin.sparkline_7d_php,
    };
  }
  return {
    currency: "USD",
    price: coin.price_usd,
    change1h: coin.change_1h_pct,
    change24h: coin.change_24h_pct,
    change7d: coin.change_7d_pct,
    volume: coin.volume_usd,
    marketCap: coin.market_cap_usd,
    sparkline: coin.sparkline_7d,
  };
}

export type Money = { value: number | null; currency: DisplayCurrency };

/**
 * A USD figure with an optional peso twin: pesos when asked for and present, else dollars.
 * The returned currency says which one was used, so a missing rate never mislabels a number.
 */
export function money(usd: number | null | undefined, php: number | null | undefined, wanted: DisplayCurrency): Money {
  if (wanted === "PHP" && typeof php === "number") return { value: php, currency: "PHP" };
  return { value: usd ?? null, currency: "USD" };
}

/** The note under a screen whose peso totals use Yahoo's USD/PHP. Empty when showing dollars. */
export function pesoNote(wanted: DisplayCurrency, rate: number | null | undefined): string {
  if (wanted !== "PHP") return "";
  if (typeof rate !== "number") return "Yahoo's USD/PHP isn't available right now, so totals stay in dollars.";
  return `Peso totals use Yahoo's USD/PHP of ${rate.toFixed(2)}.`;
}
