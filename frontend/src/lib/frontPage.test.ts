import { describe, expect, it } from "vitest";
import { pickInOrder, quotesPath, US_LIST } from "./frontPage";

describe("front page lists", () => {
  it("asks for the whole US list in one batch request", () => {
    expect(quotesPath(US_LIST.map((s) => s.symbol))).toBe("/api/quotes?symbols=AAPL,NVDA,MSFT,GOOGL,AMZN,VOO,QQQ,VT");
    expect(quotesPath(["^GSPC"])).toBe("/api/quotes?symbols=%5EGSPC");
  });

  it("picks rows in the configured order and keeps a gap for a missing one", () => {
    const rows = [{ k: "b" }, { k: null }, { k: "a" }];
    expect(pickInOrder(rows, ["a", "missing", "b"], (r) => r.k)).toEqual([{ k: "a" }, undefined, { k: "b" }]);
    expect(pickInOrder(null, ["a"], (r: { k: string }) => r.k)).toEqual([undefined]);
  });
});
