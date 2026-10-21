"use client";

import { useMemo } from "react";
import type { CryptoGlobal, Wei } from "@/lib/api";
import { useDisplayCurrency } from "@/lib/currency";
import { formatTime } from "@/lib/format";
import { buildTape } from "@/lib/tape";
import { useApi } from "@/lib/useApi";
import { Num } from "./Num";

const WEI_POLL_MS = 60_000; // backend caches WEI for 60s
const GLOBAL_POLL_MS = 300_000; // backend caches CoinGecko /global for 5 min

/**
 * TAPE: the macro strip under the masthead. One still row; scroll it sideways
 * on narrow screens. Every value is live from the backend or shows "n/a".
 */
export function TickerTape() {
  const wei = useApi<Wei>("/api/wei", WEI_POLL_MS);
  const global = useApi<CryptoGlobal>("/api/crypto/global", GLOBAL_POLL_MS);
  const [currency] = useDisplayCurrency();

  const rows = useMemo(() => wei.data?.groups.flatMap((g) => g.rows) ?? null, [wei.data]);
  const cells = buildTape(rows, global.data, currency);

  const stale = wei.meta?.stale || global.meta?.stale;
  const errors = [wei.error, global.error].filter((e) => e !== null);

  return (
    <div
      className="flex items-baseline gap-4 overflow-x-auto border-b border-hairline py-1.5 [scrollbar-color:var(--color-hairline)_transparent] [scrollbar-width:thin]"
      aria-label="Market tape"
    >
      <ul className="flex shrink-0 items-baseline">
        {cells.map((cell) => {
          const state = cell.source === "wei" ? wei : global;
          return (
            <li
              key={cell.key}
              className="flex shrink-0 items-baseline gap-1.5 border-l border-hairline px-3 text-[12px] leading-5 first:border-l-0 first:pl-0"
            >
              <span className="micro-label">{cell.label}</span>
              {state.loading ? (
                <span className="inline-block h-3 w-16 bg-hairline" aria-label="Loading" />
              ) : cell.value === null ? (
                <span className="font-mono text-muted" title={state.error?.message ?? "Not available from the source"}>
                  n/a
                </span>
              ) : (
                <>
                  <Num value={cell.value} {...cell.format} />
                  {cell.hasChange && <Num value={cell.change} change {...cell.changeFormat} />}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="micro-label ml-auto shrink-0 whitespace-nowrap">
        {stale && <span className="mr-2 text-ink">Stale</span>}
        {errors.length > 0 ? (
          <span className="text-ink normal-case tracking-normal" title={errors.map((e) => e.message).join("\n")}>
            Update failed: {errors[0].message}
          </span>
        ) : (
          wei.meta && <span className="font-mono normal-case tracking-normal">Yahoo, CoinGecko {formatTime(wei.meta.as_of)}</span>
        )}
      </p>
    </div>
  );
}
