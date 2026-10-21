import { describe, expect, it } from "vitest";
import type { CryptoCoin } from "./api";
import { coinView, money, pesoNote } from "./crypto";

const BTC: CryptoCoin = {
  id: "bitcoin", ticker: "BTC", symbol: "BTC", name: "Bitcoin", rank: 1,
  price_usd: 100_000, price_php: 6_300_000,
  change_1h_pct: 0.1, change_24h_pct: -1, change_7d_pct: 3,
  change_1h_pct_php: 0.2, change_24h_pct_php: -0.8, change_7d_pct_php: 3.4,
  volume_usd: 4e10, volume_php: 2.5e12, market_cap_usd: 2e12, market_cap_php: 1.26e14,
  sparkline_7d: [1, 2], sparkline_7d_php: [63, 126],
};

describe("coinView", () => {
  it("uses CoinGecko's own peso figures when PHP is on", () => {
    expect(coinView(BTC, "PHP")).toEqual({
      currency: "PHP", price: 6_300_000, change1h: 0.2, change24h: -0.8, change7d: 3.4,
      volume: 2.5e12, marketCap: 1.26e14, sparkline: [63, 126],
    });
  });

  it("stays in dollars for USD, and when a coin has no peso price", () => {
    expect(coinView(BTC, "USD").price).toBe(100_000);
    const noPeso = coinView({ ...BTC, price_php: null }, "PHP");
    expect(noPeso.currency).toBe("USD");
    expect(noPeso.change24h).toBe(-1);
  });
});

describe("money", () => {
  it("uses the peso figure only when pesos are wanted and present", () => {
    expect(money(10, 600, "PHP")).toEqual({ value: 600, currency: "PHP" });
    expect(money(10, 600, "USD")).toEqual({ value: 10, currency: "USD" });
    expect(money(10, null, "PHP")).toEqual({ value: 10, currency: "USD" });
    expect(money(undefined, undefined, "PHP")).toEqual({ value: null, currency: "USD" });
  });
});

describe("pesoNote", () => {
  it("names the rate, says when it is missing, and is empty in dollars", () => {
    expect(pesoNote("PHP", 63.287)).toBe("Peso totals use Yahoo's USD/PHP of 63.29.");
    expect(pesoNote("PHP", null)).toMatch(/stay in dollars/);
    expect(pesoNote("USD", 63.2)).toBe("");
  });
});
