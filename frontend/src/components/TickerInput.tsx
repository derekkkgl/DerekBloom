"use client";

import { useId, useState, type KeyboardEvent, type Ref } from "react";
import type { TickerMatch } from "@/lib/api";
import { matchLabel } from "@/lib/search";
import { useTickerSearch } from "@/lib/useTickerSearch";
import { TextInput } from "./Field";

/**
 * A ticker box that suggests as you type: "b" lists BTC and BNB at once, then Yahoo's matches.
 * ↑ ↓ move, Enter or Tab picks, Esc closes the list. Typing any ticker by hand still works.
 */
export function TickerInput({
  value,
  onChange,
  label,
  placeholder = "Ticker",
  width = "w-24",
  types,
  form,
  disabled,
  inputRef,
  onKeyDown,
}: {
  value: string;
  onChange: (ticker: string) => void;
  label: string;
  placeholder?: string;
  width?: string;
  types?: string[];
  form?: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const { results, searching, error } = useTickerSearch(open ? value : "", types);
  const showList = open && value.trim() !== "" && (results.length > 0 || searching || Boolean(error));

  function pick(match: TickerMatch) {
    onChange(match.ticker);
    setOpen(false);
    setActive(-1);
  }

  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (showList && e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (showList && e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
      return;
    }
    // Enter or Tab takes the highlighted suggestion, unless it's already what's typed (then Enter saves).
    if (showList && active >= 0 && results[active] && results[active].ticker !== value && (e.key === "Enter" || e.key === "Tab")) {
      if (e.key === "Enter") e.preventDefault(); // pick the suggestion; a second Enter saves the row
      pick(results[active]);
      return;
    }
    if (showList && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    onKeyDown?.(e);
  }

  return (
    <span className={`relative inline-block ${width}`}>
      <TextInput
        ref={inputRef}
        form={form}
        disabled={disabled}
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={keyDown}
        className="uppercase"
      />
      {showList && (
        <div className="absolute left-0 top-full z-20 mt-1 w-[min(360px,calc(100vw-32px))] border border-ink bg-paper">
          <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="max-h-72 overflow-y-auto py-1">
            {results.map((match, i) => (
              <li
                key={match.ticker}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click: it fires before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(match);
                }}
                onMouseEnter={() => setActive(i)}
                className={`grid cursor-pointer grid-cols-[5.5rem_1fr_auto] items-baseline gap-2 border-l-2 px-3 py-1 text-[13px] leading-5 ${
                  i === active ? "border-ink bg-ink/[0.06]" : "border-transparent"
                }`}
              >
                <span className="font-mono text-[12px] font-medium">{match.ticker}</span>
                <span className="truncate">{match.name ?? ""}</span>
                <span className="font-mono text-[11px] text-muted">{matchLabel(match)}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-hairline px-3 py-1 text-[11px] leading-4 text-muted" aria-live="polite">
            {error ? `Yahoo search unavailable: ${error}` : searching ? "Searching Yahoo…" : "↑↓ move · Enter picks · Esc closes"}
          </p>
        </div>
      )}
    </span>
  );
}
