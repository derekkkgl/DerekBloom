"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { commandHref, commandText, isTicker, parseCommand, suggest, type Command } from "@/lib/command";
import { isPaletteShortcut, useGlobalKeydown } from "@/lib/hotkeys";
import { FUNCTIONS } from "@/lib/registry";
import { matchLabel } from "@/lib/search";
import { useStoredString } from "@/lib/storage";
import { useTickerSearch } from "@/lib/useTickerSearch";

const HISTORY_KEY = "dailytape:history";
const HISTORY_MAX = 20;
const RECENT_SHOWN = 5;
const TICKERS_SHOWN = 6;

/** One line in the list: a command, the group heading it sits under, and an optional right-hand label. */
type Entry = { cmd: Command; group: "Recent" | "Functions" | "Tickers"; label?: string };

function parseHistory(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The masthead's "Look up" box. Typing in it opens a list that drops down under the box.
 * Cmd+K, Ctrl+K, or "/" jumps here from anywhere. Enter runs the highlighted line,
 * Esc closes, and Up arrow on an empty box steps back through past commands.
 */
export function CommandPalette() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [active, setActive] = useState(0);
  const [historyCursor, setHistoryCursor] = useState(-1); // -1 = not browsing history
  const [problem, setProblem] = useState<string | null>(null);

  const [rawHistory, setRawHistory] = useStoredString(HISTORY_KEY, "[]");
  const history = useMemo(() => parseHistory(rawHistory), [rawHistory]);

  const recent = useMemo(
    () =>
      input.trim()
        ? []
        : history
            .map((text) => parseCommand(text, FUNCTIONS))
            .filter((cmd): cmd is Command => cmd !== null && !cmd.problem)
            .slice(0, RECENT_SHOWN),
    [history, input],
  );
  const matches = useMemo(() => suggest(input, FUNCTIONS, input.trim() ? 8 : FUNCTIONS.length), [input]);

  // One word that could be a ticker: also search tickers, so "b" offers BTC. Each opens its DES.
  const words = input.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const tickerQuery = open && words.length === 1 && isTicker(words[0]) ? words[0] : "";
  const tickerSearch = useTickerSearch(tickerQuery, undefined, TICKERS_SHOWN);
  const entries = useMemo(() => {
    const word = tickerQuery;
    const tickers: Entry[] = tickerSearch.results.map((m) => ({
      cmd: { mnemonic: "DES", ticker: m.ticker, title: m.name ?? m.ticker },
      group: "Tickers",
      label: matchLabel(m),
    }));
    const functions: Entry[] = matches.map((cmd) => ({ cmd, group: "Functions" }));
    // A function whose mnemonic starts with the word ("WE" -> WEI) stays on top; otherwise tickers lead.
    const functionsFirst = word !== "" && matches.some((m) => !m.ticker && m.mnemonic.startsWith(word));
    const ordered = [
      ...recent.map((cmd): Entry => ({ cmd, group: "Recent" })),
      ...(functionsFirst ? [...functions, ...tickers] : [...tickers, ...functions]),
    ];
    const seen = new Set<string>();
    return ordered.filter((e) => {
      const key = commandText(e.cmd);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [recent, matches, tickerSearch.results, tickerQuery]);
  const items = entries.map((e) => e.cmd);

  useGlobalKeydown((e) => {
    if (!isPaletteShortcut(e)) return;
    e.preventDefault();
    inputRef.current?.focus();
    inputRef.current?.select();
  });

  function close() {
    setOpen(false);
    setActive(0);
    setHistoryCursor(-1);
    setProblem(null);
  }

  function edit(text: string) {
    setInput(text);
    setActive(0);
    setHistoryCursor(-1);
    setProblem(null);
    setOpen(true);
  }

  function run(cmd: Command | null) {
    if (!cmd) {
      setProblem("Not a command. Try NVDA GP, BTC DES, or WEI.");
      return;
    }
    if (cmd.problem) {
      setProblem(cmd.problem);
      return;
    }
    const text = commandText(cmd);
    setRawHistory(JSON.stringify([text, ...history.filter((h) => h !== text)].slice(0, HISTORY_MAX)));
    setInput("");
    close();
    inputRef.current?.blur();
    router.push(commandHref(cmd));
  }

  function recall(cursor: number) {
    setHistoryCursor(cursor);
    setInput(cursor >= 0 ? history[cursor] : "");
    setActive(0);
    setProblem(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Up arrow recalls history from an empty box (or while already stepping through it);
    // otherwise the arrows move the highlight in the list.
    const browsingHistory = (input === "" && active === 0) || historyCursor >= 0;
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close();
        inputRef.current?.blur();
        break;
      case "Enter":
        e.preventDefault();
        run(items[active] ?? parseCommand(input, FUNCTIONS));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (browsingHistory && historyCursor < history.length - 1) recall(historyCursor + 1);
        else if (!browsingHistory) setActive((i) => Math.max(i - 1, 0));
        break;
      case "ArrowDown":
        e.preventDefault();
        setOpen(true);
        if (historyCursor >= 0) recall(historyCursor - 1);
        else setActive((i) => Math.min(i + 1, items.length - 1));
        break;
    }
  }

  const activeId = items[active] ? `${listId}-${active}` : undefined;

  return (
    <div className="relative">
      <label className="flex items-center gap-2 border-b border-ink pb-0.5">
        <Search size={14} strokeWidth={1.5} aria-hidden="true" className="text-muted" />
        <span className="sr-only">Look up a function or ticker</span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? activeId : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Look up"
          value={input}
          onChange={(e) => edit(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
          className="w-44 bg-transparent font-mono text-[13px] uppercase outline-none placeholder:font-sans placeholder:normal-case placeholder:text-muted focus-visible:outline-none"
        />
        <kbd className="font-mono text-[11px] text-muted">⌘K</kbd>
      </label>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-[min(440px,calc(100vw-32px))] border border-ink bg-paper">
          <ul id={listId} role="listbox" aria-label="Commands" className="max-h-[60vh] overflow-y-auto py-1">
            {entries.map(({ cmd, group, label }, i) => (
              <li key={`${group}-${commandText(cmd)}`} role="presentation">
                {(i === 0 || entries[i - 1].group !== group) && <p className="micro-label px-3 pt-1.5 pb-0.5">{group}</p>}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown, not click: it fires before the input's blur closes the list.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    run(cmd);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`grid cursor-pointer grid-cols-[4.5rem_1fr_auto] items-baseline gap-2 border-l-2 px-3 py-1 text-[13px] leading-5 ${
                    i === active ? "border-ink bg-ink/[0.06]" : "border-transparent"
                  }`}
                >
                  {group === "Tickers" ? (
                    <>
                      <span className="truncate font-mono text-[12px] font-medium">{cmd.ticker}</span>
                      <span className="truncate">{cmd.title}</span>
                      <span className="font-mono text-[11px] text-muted">{label}</span>
                    </>
                  ) : (
                    <>
                      <span className="font-mono text-[12px] font-medium">{cmd.mnemonic}</span>
                      <span className="truncate">{cmd.title}</span>
                      <span className="font-mono text-[12px] text-muted">{cmd.ticker ?? (cmd.problem ? "+ ticker" : "")}</span>
                    </>
                  )}
                </div>
              </li>
            ))}
            {items.length === 0 && (
              <li className="px-3 py-2 text-[13px] text-muted">{tickerSearch.searching ? "Searching tickers…" : "No matching function or ticker."}</li>
            )}
          </ul>
          <p className="border-t border-hairline px-3 py-1.5 text-[11px] leading-4 text-muted" aria-live="polite">
            {problem ?? "Type TICKER FUNCTION, e.g. NVDA GP. A ticker alone opens its description. ↑↓ move, Enter opens, Esc closes."}
          </p>
        </div>
      )}
    </div>
  );
}
