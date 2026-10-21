import { describe, expect, it } from "vitest";
import { heat, heatClass } from "./heat";

describe("heat", () => {
  it("steps by the size of the move", () => {
    expect(heat(0.4)).toEqual({ tone: "up", step: 1 });
    expect(heat(1)).toEqual({ tone: "up", step: 2 });
    expect(heat(2.99)).toEqual({ tone: "up", step: 2 });
    expect(heat(3)).toEqual({ tone: "up", step: 3 });
    expect(heat(-0.2)).toEqual({ tone: "down", step: 1 });
    expect(heat(-12)).toEqual({ tone: "down", step: 3 });
  });

  it("is flat for no move, a move that rounds to zero, or no data", () => {
    for (const v of [0, 0.004, -0.004, null, undefined, NaN]) expect(heat(v)).toEqual({ tone: "flat", step: 0 });
  });

  it("maps to full Tailwind class names", () => {
    expect(heatClass(heat(5))).toBe("bg-up-3");
    expect(heatClass(heat(-1.5))).toBe("bg-down-2");
    expect(heatClass(heat(null))).toBe("bg-paper");
  });
});
