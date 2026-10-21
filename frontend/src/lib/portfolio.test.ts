import { describe, expect, it } from "vitest";
import type { Account, Transaction } from "./api";
import { moneyDecimals, unitDecimals } from "./format";
import {
  accountCurrency,
  barWidth,
  emptyForm,
  formatDuration,
  formatMonth,
  formFromTransaction,
  manilaToday,
  parseAmount,
  projectionSeries,
  toInput,
  typeFields,
  yieldSourceLabel,
} from "./portfolio";

const binance: Account = {
  id: 2, name: "Binance", deposited_php: 0, received_usd: 0, avg_rate: null, first_deposit: null, last_deposit: null, cash: [],
};

describe("unitDecimals and moneyDecimals", () => {
  it("shows units exactly, up to satoshis", () => {
    expect(unitDecimals(0.0015)).toBe(4);
    expect(unitDecimals(2)).toBe(0);
    expect(unitDecimals(0.123456789)).toBe(8);
    expect(unitDecimals(null)).toBe(0);
  });

  it("keeps pesos whole and dollars to the cent", () => {
    expect(moneyDecimals("PHP")).toBe(0);
    expect(moneyDecimals("USD")).toBe(2);
  });
});

describe("entry form", () => {
  it("starts in the account's usual currency", () => {
    expect(accountCurrency("Coins.ph")).toBe("PHP");
    expect(accountCurrency("Binance")).toBe("USDT");
    expect(accountCurrency("Gotrade")).toBe("USD");
    expect(emptyForm("2026-10-21", binance)).toMatchObject({ account_id: "2", price_currency: "USDT", type: "BUY" });
  });

  it("parses typed amounts, with commas and symbols", () => {
    expect(parseAmount("3,500,000")).toBe(3_500_000);
    expect(parseAmount(" ₱5,850.50 ")).toBe(5_850.5);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNaN();
  });

  it("builds a buy, dropping fields the type doesn't use", () => {
    const form = { ...emptyForm("2026-10-21", binance), asset: " eth ", units: "0.05", price: "2,500", fee: "0.001", fee_currency: "bnb", php_amount: "99" };
    expect(toInput(form)).toEqual({
      input: {
        account_id: 2, trade_date: "2026-10-21", type: "BUY", asset: "ETH", units: 0.05, price: 2500,
        price_currency: "USDT", fee: 0.001, fee_currency: "BNB", php_amount: null, note: null,
      },
    });
  });

  it("builds a deposit with the pesos sent and no price", () => {
    const form = { ...emptyForm("2026-10-21", binance, "DEPOSIT"), asset: "usdt", units: "100", price: "5", php_amount: "5,900" };
    const result = toInput(form);
    expect("input" in result && result.input).toMatchObject({ asset: "USDT", units: 100, price: null, php_amount: 5900, fee: 0 });
  });

  it("names the first problem", () => {
    const form = emptyForm("2026-10-21", binance);
    expect(toInput({ ...form, asset: "BTC", units: "x" })).toEqual({ problem: "Units isn't a number." });
    expect(toInput({ ...form, units: "1" })).toEqual({ problem: "Enter the asset." });
    expect(toInput({ ...form, asset: "BTC" })).toEqual({ problem: "Enter the units." });
    expect(toInput({ ...form, account_id: "", asset: "BTC", units: "1" })).toEqual({ problem: "Choose an account." });
  });

  it("round-trips a saved transaction for editing", () => {
    const tx = {
      id: 7, account_id: 3, account: "Gotrade", trade_date: "2026-10-01", type: "BUY", asset: "VOO", units: 0.1, price: 500,
      price_currency: "USD", fee: 0, fee_currency: null, php_amount: null, note: null, source: "manual", deposit_rate: 58,
      peso_amount: 2900, yahoo_rate: false,
    } satisfies Transaction;
    const form = formFromTransaction(tx);
    expect(form).toMatchObject({ units: "0.1", price: "500", fee: "", fee_currency: "", php_amount: "" });
    expect("input" in toInput(form) && toInput(form)).toBeTruthy();
  });

  it("labels units by type", () => {
    expect(typeFields("DEPOSIT").unitsLabel).toBe("Amount");
    expect(typeFields("DIVIDEND").unitsLabel).toBe("Cash");
    expect(typeFields("TRANSFER")).toMatchObject({ price: false, fee: true, feeCurrency: false });
  });
});

describe("display helpers", () => {
  it("dates trades in Manila", () => {
    expect(manilaToday(new Date("2026-10-21T17:00:00Z"))).toBe("2026-10-22");
  });

  it("keeps bars inside the track", () => {
    expect(barWidth(33.333)).toBe("33.3%");
    expect(barWidth(140)).toBe("100.0%");
    expect(barWidth(null)).toBe("0.0%");
  });

  it("names yield sources", () => {
    expect(yieldSourceLabel("staking")).toBe("Staking, your rate");
    expect(yieldSourceLabel(null)).toBe("None");
  });

  it("turns the projection into monthly chart points", () => {
    const points = [{ month: 0, date: "2026-10", capital: 100, income_month: 1 }];
    expect(projectionSeries(points)).toEqual([{ time: "2026-10-01", value: 100 }]);
    expect(projectionSeries(points, "income_month")[0].value).toBe(1);
  });

  it("writes months and durations plainly", () => {
    expect(formatMonth("2039-09")).toBe("Sep 2039");
    expect(formatMonth(null)).toBe("—");
    expect(formatDuration(155)).toBe("12 years 11 months");
    expect(formatDuration(1)).toBe("1 month");
    expect(formatDuration(24)).toBe("2 years");
    expect(formatDuration(0)).toBe("Reached");
    expect(formatDuration(null)).toBe("—");
  });
});
