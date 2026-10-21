import { describe, expect, it } from "vitest";
import { squarify } from "./treemap";

const area = (t: { w: number; h: number }) => t.w * t.h;

describe("squarify", () => {
  it("gives each tile an area in proportion to its weight and fills the box", () => {
    const tiles = squarify([6, 6, 4, 3, 2, 2, 1].map((weight, i) => ({ item: i, weight })), 6, 4);
    expect(tiles).toHaveLength(7);
    const total = tiles.reduce((s, t) => s + area(t), 0);
    expect(total).toBeCloseTo(24);
    for (const t of tiles) expect(area(t)).toBeCloseTo([6, 6, 4, 3, 2, 2, 1][t.item]);
  });

  it("keeps tiles inside the box without overlapping", () => {
    const tiles = squarify([50, 20, 10, 9, 5, 3, 2, 1].map((weight, i) => ({ item: i, weight })), 200, 100);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9);
      expect(t.y).toBeGreaterThanOrEqual(-1e-9);
      expect(t.x + t.w).toBeLessThanOrEqual(200 + 1e-9);
      expect(t.y + t.h).toBeLessThanOrEqual(100 + 1e-9);
    }
    for (const a of tiles) {
      for (const b of tiles) {
        if (a === b) continue;
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(overlapX > 1e-9 && overlapY > 1e-9).toBe(false);
      }
    }
  });

  it("puts the largest item first and keeps tiles roughly square", () => {
    const tiles = squarify([1, 1, 1, 1].map((weight, i) => ({ item: i, weight })), 2, 2);
    for (const t of tiles) expect(t.w / t.h).toBeCloseTo(1);
    expect(squarify([{ item: "small", weight: 1 }, { item: "big", weight: 9 }], 10, 10)[0].item).toBe("big");
  });

  it("drops items without a positive weight, and an empty box gives nothing", () => {
    const tiles = squarify([{ item: "a", weight: 2 }, { item: "b", weight: 0 }, { item: "c", weight: NaN }, { item: "d", weight: -1 }], 4, 2);
    expect(tiles.map((t) => t.item)).toEqual(["a"]);
    expect(squarify([], 4, 2)).toEqual([]);
    expect(squarify([{ item: "a", weight: 1 }], 0, 2)).toEqual([]);
  });
});
