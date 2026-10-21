// Bloomberg-style command parsing and the palette's fuzzy suggestions.
// Pure functions with no React or registry imports, so they're easy to test.
//
//   "NVDA GP"  -> GP (price chart) for NVDA
//   "WEI"      -> WEI, a market-wide screen
//   "NVDA"     -> DES (description) for NVDA

export type CommandSpec = {
  mnemonic: string;
  title: string;
  needsTicker: boolean;
};

export type Command = {
  mnemonic: string;
  ticker?: string;
  title: string;
  /** Set when the command can't run yet, e.g. "GP needs a ticker". */
  problem?: string;
};

/** Same rule as the backend (app/core/tickers.py): letters, digits, . - ^ = */
const TICKER_RE = /^[A-Z0-9.\-^=]{1,20}$/;
const DEFAULT_FOR_TICKER = "DES";
const PREFIX_SCORE = 80;

export function isTicker(text: string): boolean {
  return TICKER_RE.test(text);
}

function tokens(input: string): string[] {
  return input.trim().toUpperCase().split(/\s+/).filter(Boolean);
}

function find(specs: CommandSpec[], mnemonic: string): CommandSpec | undefined {
  return specs.find((s) => s.mnemonic === mnemonic);
}

function build(spec: CommandSpec, ticker?: string): Command {
  if (spec.needsTicker && !ticker) {
    return { mnemonic: spec.mnemonic, title: spec.title, problem: `${spec.mnemonic} needs a ticker, e.g. NVDA ${spec.mnemonic}` };
  }
  if (!spec.needsTicker && ticker) {
    return { mnemonic: spec.mnemonic, title: spec.title, problem: `${spec.mnemonic} is market-wide. Type it without a ticker` };
  }
  return { mnemonic: spec.mnemonic, title: spec.title, ...(ticker ? { ticker } : {}) };
}

/** Parse a complete command. Returns null when the text isn't a command at all. */
export function parseCommand(input: string, specs: CommandSpec[]): Command | null {
  const parts = tokens(input);

  if (parts.length === 1) {
    const [word] = parts;
    const spec = find(specs, word);
    if (spec) return build(spec);
    const fallback = find(specs, DEFAULT_FOR_TICKER);
    if (fallback && isTicker(word)) return build(fallback, word);
    return null;
  }

  if (parts.length === 2) {
    const [ticker, mnemonic] = parts;
    const spec = find(specs, mnemonic);
    if (spec && isTicker(ticker)) return build(spec, ticker);
  }

  return null;
}

/** The text a command is typed as, and stored as in history: "NVDA GP" or "WEI". */
export function commandText(cmd: Pick<Command, "mnemonic" | "ticker">): string {
  return cmd.ticker ? `${cmd.ticker} ${cmd.mnemonic}` : cmd.mnemonic;
}

/** Where a command opens: /fn/GP/NVDA or /fn/WEI */
export function commandHref(cmd: Pick<Command, "mnemonic" | "ticker">): string {
  return cmd.ticker ? `/fn/${cmd.mnemonic}/${encodeURIComponent(cmd.ticker)}` : `/fn/${cmd.mnemonic}`;
}

/**
 * How well `query` matches a function: 0 means no match, higher is better.
 * Exact mnemonic > mnemonic prefix > title word prefix > letters in order.
 */
export function matchScore(query: string, spec: CommandSpec): number {
  const q = query.toUpperCase();
  const mnemonic = spec.mnemonic.toUpperCase();
  const title = spec.title.toUpperCase();
  if (!q) return 1;
  if (mnemonic === q) return 100;
  if (mnemonic.startsWith(q)) return PREFIX_SCORE;
  if (title.split(/\s+/).some((word) => word.startsWith(q))) return 60;
  if (isSubsequence(q, mnemonic)) return 40;
  if (isSubsequence(q.replace(/\s+/g, ""), title)) return 20;
  return 0;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const ch of haystack) if (ch === needle[i]) i++;
  return i === needle.length;
}

/**
 * What the palette lists while typing. Handles the half-typed forms too:
 *   ""        -> every function
 *   "WE"      -> functions matching WE
 *   "NVDA G"  -> functions that take a ticker and match G, for NVDA
 *   "CR"      -> CRYPTO first, then CR DES
 *   "NVDA"    -> NVDA DES first, then functions matching NVDA
 */
export function suggest(input: string, specs: CommandSpec[], limit = 8): Command[] {
  const parts = tokens(input);
  const out: Command[] = [];
  const seen = new Set<string>();
  const add = (cmd: Command | null) => {
    if (!cmd) return;
    const key = commandText(cmd);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cmd);
  };
  const ranked = (query: string, pool: CommandSpec[]) =>
    pool
      .map((spec) => ({ spec, score: matchScore(query, spec) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.spec);

  if (parts.length === 0) {
    for (const spec of specs) add(build(spec));
    return out.slice(0, limit);
  }

  if (parts.length === 1) {
    // A mnemonic match ("CR" -> CRYPTO) beats reading the word as a ticker ("CR DES").
    const [word] = parts;
    const matches = ranked(word, specs);
    const strong = matches.filter((spec) => matchScore(word, spec) >= PREFIX_SCORE);
    for (const spec of strong) add(build(spec));
    if (isTicker(word) && !find(specs, word)) add(parseCommand(word, specs));
    for (const spec of matches) add(build(spec));
    return out.slice(0, limit);
  }

  const [ticker, second] = parts;
  if (parts.length === 2 && isTicker(ticker)) {
    const tickerSpecs = specs.filter((s) => s.needsTicker);
    for (const spec of ranked(second, tickerSpecs)) add(build(spec, ticker));
  }

  // Free text ("price chart"): also search titles.
  for (const spec of ranked(parts.join(" "), specs)) add(build(spec));
  return out.slice(0, limit);
}
