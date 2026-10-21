import { describe, expect, it } from "vitest";
import { commandHref, commandText, matchScore, parseCommand, suggest, type CommandSpec } from "./command";

const SPECS: CommandSpec[] = [
  { mnemonic: "WEI", title: "World equity indices", needsTicker: false },
  { mnemonic: "CRYPTO", title: "Crypto board", needsTicker: false },
  { mnemonic: "DES", title: "Description", needsTicker: true },
  { mnemonic: "GP", title: "Price chart", needsTicker: true },
  { mnemonic: "N", title: "News wire", needsTicker: false },
];

describe("parseCommand", () => {
  it("reads TICKER MNEMONIC like Bloomberg", () => {
    expect(parseCommand("nvda gp", SPECS)).toEqual({ mnemonic: "GP", ticker: "NVDA", title: "Price chart" });
  });

  it("reads a market-wide mnemonic alone", () => {
    expect(parseCommand("WEI", SPECS)).toEqual({ mnemonic: "WEI", title: "World equity indices" });
  });

  it("opens DES for a ticker typed alone", () => {
    expect(parseCommand("  7203.T ", SPECS)?.mnemonic).toBe("DES");
    expect(parseCommand("PHP=X", SPECS)?.ticker).toBe("PHP=X");
  });

  it("explains a missing or unwanted ticker", () => {
    expect(parseCommand("GP", SPECS)?.problem).toMatch(/needs a ticker/);
    expect(parseCommand("NVDA WEI", SPECS)?.problem).toMatch(/market-wide/);
  });

  it("rejects text that isn't a command", () => {
    expect(parseCommand("", SPECS)).toBeNull();
    expect(parseCommand("NVDA$ GP", SPECS)).toBeNull();
    expect(parseCommand("NVDA XX", SPECS)).toBeNull();
    expect(parseCommand("a b c", SPECS)).toBeNull();
  });
});

describe("commandText and commandHref", () => {
  it("round-trip a command", () => {
    expect(commandText({ mnemonic: "GP", ticker: "NVDA" })).toBe("NVDA GP");
    expect(commandHref({ mnemonic: "GP", ticker: "NVDA" })).toBe("/fn/GP/NVDA");
    expect(commandHref({ mnemonic: "DES", ticker: "^GSPC" })).toBe("/fn/DES/%5EGSPC");
    expect(commandHref({ mnemonic: "WEI" })).toBe("/fn/WEI");
  });
});

describe("matchScore", () => {
  it("ranks exact > prefix > title word > letters in order", () => {
    const gp = SPECS[3];
    expect(matchScore("GP", gp)).toBeGreaterThan(matchScore("G", gp));
    expect(matchScore("G", gp)).toBeGreaterThan(matchScore("CHART", gp));
    expect(matchScore("CHART", gp)).toBeGreaterThan(matchScore("PCH", gp));
    expect(matchScore("ZZ", gp)).toBe(0);
  });
});

describe("suggest", () => {
  it("lists every function for an empty box", () => {
    expect(suggest("", SPECS).map((c) => c.mnemonic)).toEqual(["WEI", "CRYPTO", "DES", "GP", "N"]);
  });

  it("puts the exact mnemonic first", () => {
    expect(suggest("cr", SPECS)[0].mnemonic).toBe("CRYPTO");
    expect(suggest("N", SPECS)[0].mnemonic).toBe("N");
  });

  it("offers ticker functions for a half-typed 'NVDA G'", () => {
    const [first] = suggest("NVDA G", SPECS);
    expect(commandText(first)).toBe("NVDA GP");
  });

  it("offers TICKER DES first for a lone ticker", () => {
    expect(commandText(suggest("NVDA", SPECS)[0])).toBe("NVDA DES");
  });

  it("finds functions by title words", () => {
    expect(suggest("price chart", SPECS).map((c) => c.mnemonic)).toContain("GP");
  });

  it("respects the limit", () => {
    expect(suggest("", SPECS, 2)).toHaveLength(2);
  });
});
