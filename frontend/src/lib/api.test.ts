import { describe, expect, it } from "vitest";
import { combineMeta, type Meta } from "./api";

const meta = (source: string, as_of: string, stale = false): Meta => ({ source, as_of, cached: false, stale });

describe("combineMeta", () => {
  it("keeps the older time and flags stale if either response is stale", () => {
    const merged = combineMeta(meta("yahoo", "2026-10-21T10:05:00Z"), meta("yahoo", "2026-10-21T10:00:00Z", true));
    expect(merged).toEqual({ source: "yahoo", as_of: "2026-10-21T10:00:00Z", cached: false, stale: true });
  });

  it("lists different sources once each and ignores missing metas", () => {
    expect(combineMeta(meta("coingecko", "a"), null, meta("yahoo", "b"))?.source).toBe("coingecko, yahoo");
    expect(combineMeta(null, null)).toBeNull();
  });
});
