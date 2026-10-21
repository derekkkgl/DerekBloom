import { describe, expect, it } from "vitest";
import type { ImapGroup } from "./api";
import { gridSize, imapTiles, rateDecimals } from "./world";

describe("rateDecimals", () => {
  it("gives small rates more decimals", () => {
    expect(rateDecimals(157.97)).toBe(2);
    expect(rateDecimals(1.4105)).toBe(4);
    expect(rateDecimals(0.0158)).toBe(4);
    expect(rateDecimals(0.00473)).toBe(6);
    expect(rateDecimals(null)).toBe(2);
  });
});

const row = { change_pct: 1.2, last_date: "2026-10-21" };

describe("imapTiles", () => {
  it("sizes sectors by S&P 500 weight and skips a sector with no weight", () => {
    const group: ImapGroup = {
      id: "sectors",
      title: "US sectors",
      rows: [
        { ...row, symbol: "XLK", name: "Technology", weight_pct: 40.45 },
        { ...row, symbol: "XLU", name: "Utilities", weight_pct: null },
      ],
    };
    const tiles = imapTiles(group, "USD");
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ key: "XLK", label: "Technology", weight: 40.45, change: 1.2, detail: "XLK · 40.5%", href: "/fn/DES/XLK" });
  });

  it("sizes world ETFs by fund assets in the chosen currency", () => {
    const group: ImapGroup = {
      id: "world",
      title: "World ETFs",
      rows: [
        { ...row, symbol: "VT", name: "Whole world", size_usd: 1e11, size_php: 6.3e12 },
        { ...row, symbol: "FXI", name: "China large caps", size_usd: null, size_php: null },
      ],
    };
    const [vt, ...rest] = imapTiles(group, "PHP");
    expect(rest).toHaveLength(0);
    expect(vt.weight).toBe(1e11);
    expect(vt.detail).toBe("VT · ₱6.30T");
  });

  it("uses the square root of size for your list, with your names", () => {
    const group: ImapGroup = {
      id: "home",
      title: "Your Home list",
      rows: [{ ...row, input: "NVDA", symbol: "NVDA", name: "NVIDIA Corporation", size_usd: 4e12, size_php: null }],
    };
    const [nvda] = imapTiles(group, "USD", { NVDA: "NVIDIA" });
    expect(nvda.weight).toBe(2e6);
    expect(nvda.detail).toBe("NVIDIA · $4.00T");
  });
});

describe("gridSize", () => {
  it("reaches one past the furthest square", () => {
    expect(gridSize([{ col: 0, row: 1 }, { col: 8, row: 6 }, { col: 3, row: 0 }])).toEqual({ cols: 9, rows: 7 });
    expect(gridSize([])).toEqual({ cols: 0, rows: 0 });
  });
});
