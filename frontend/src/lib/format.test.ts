import { describe, expect, it } from "vitest";
import { autoDecimals, direction, formatDate, formatNumber, formatPercent, formatStamp, formatTime, MISSING, priceDecimals } from "./format";

describe("formatNumber", () => {
  it("adds thousands separators and rounds float noise from Yahoo", () => {
    expect(formatNumber(7712.56982421875)).toBe("7,712.57");
  });

  it("shows missing values as an em dash, never 0 or NaN", () => {
    for (const v of [null, undefined, NaN, Infinity, -Infinity]) expect(formatNumber(v)).toBe(MISSING);
  });

  it("puts the currency symbol after the sign", () => {
    expect(formatNumber(108412.3, { currency: "USD", decimals: 0 })).toBe("$108,412");
    expect(formatNumber(-1234.5, { currency: "PHP" })).toBe("-₱1,234.50");
    expect(formatNumber(5, { currency: "XYZ" })).toBe("XYZ 5.00");
  });

  it("uses compact suffixes K, M, B, T", () => {
    expect(formatNumber(2_813_040_486_228, { compact: true })).toBe("2.81T");
    expect(formatNumber(81_894_672_365, { compact: true })).toBe("81.89B");
    expect(formatNumber(4_500_000, { compact: true, currency: "PHP" })).toBe("₱4.50M");
    expect(formatNumber(1_500, { compact: true })).toBe("1.50K");
    expect(formatNumber(999, { compact: true })).toBe("999.00");
  });

  it("signs changes and never prints -0.00", () => {
    expect(formatNumber(0.42, { signed: true, percent: true })).toBe("+0.42%");
    expect(formatNumber(-0.001, { signed: true, percent: true })).toBe("0.00%");
    expect(formatNumber(-0.04)).toBe("-0.0400");
  });

  it("appends a unit suffix", () => {
    expect(formatNumber(3.2, { signed: true, decimals: 1, suffix: "bp" })).toBe("+3.2bp");
  });
});

describe("autoDecimals", () => {
  it("gives small coins more decimals", () => {
    expect(autoDecimals(108000)).toBe(2);
    expect(autoDecimals(0.5321)).toBe(4);
    expect(autoDecimals(0.00001234)).toBe(6);
    expect(autoDecimals(0)).toBe(2);
  });
});

describe("formatPercent", () => {
  it("adds a percent sign", () => {
    expect(formatPercent(59.5606, { decimals: 1 })).toBe("59.6%");
  });
});

describe("direction", () => {
  it("treats values that round to zero as flat", () => {
    expect(direction(0.42)).toBe(1);
    expect(direction(-0.42)).toBe(-1);
    expect(direction(0.004)).toBe(0);
    expect(direction(null)).toBe(0);
  });
});

describe("formatTime", () => {
  it("handles missing and bad timestamps", () => {
    expect(formatTime(null)).toBe(MISSING);
    expect(formatTime("not a date")).toBe(MISSING);
    expect(formatTime("2026-10-21T09:43:38Z")).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("formatDate and formatStamp", () => {
  it("reads date-only strings as calendar dates", () => {
    expect(formatDate("2025-08-24")).toBe("24 Aug 2025");
    expect(formatDate("2026-10-20", { year: false })).toBe("20 Oct");
    expect(formatDate(null)).toBe(MISSING);
    expect(formatDate("garbage")).toBe(MISSING);
  });

  it("shows a time for today's stories and a date for older ones", () => {
    const now = new Date(2026, 9, 21, 18, 0);
    expect(formatStamp(new Date(2026, 9, 21, 9, 41).toISOString(), now)).toBe("09:41");
    expect(formatStamp(new Date(2026, 9, 20, 9, 41).toISOString(), now)).toBe("20 Oct");
    expect(formatStamp(null, now)).toBe(MISSING);
  });
});

describe("priceDecimals", () => {
  it("shows BTC in whole units and small coins with more decimals", () => {
    expect(priceDecimals("BTC", 100_000)).toBe(0);
    expect(priceDecimals("BTC-USD", 100_000)).toBe(0);
    expect(priceDecimals("ETH", 2_400)).toBe(2);
    expect(priceDecimals("DOGE", 0.21)).toBe(4);
    expect(priceDecimals("X", null)).toBe(2);
  });
});
