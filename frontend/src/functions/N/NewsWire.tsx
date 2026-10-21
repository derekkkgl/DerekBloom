"use client";

import { useState } from "react";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Panel } from "@/components/Panel";
import type { News } from "@/lib/api";
import { formatStamp } from "@/lib/format";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";

const NEWS_POLL_MS = 300_000; // backend caches each feed for 5 minutes
const LIMIT = 50;

const TABS = [
  { key: "all", label: "All" },
  { key: "markets", label: "Markets" },
  { key: "crypto", label: "Crypto" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export function NewsWire({ mnemonic, title }: FunctionScreenProps) {
  const [tab, setTab] = useState<Tab>("all");
  const news = useApi<News>(`/api/news?category=${tab}&limit=${LIMIT}`, NEWS_POLL_MS);
  const failed = news.data?.sources.filter((s) => !s.ok) ?? [];

  return (
    <Panel title={title} mnemonic={mnemonic} meta={news.meta}>
      <div role="tablist" aria-label="News category" className="mb-1 flex gap-4 text-[13px]">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 pb-0.5 ${tab === t.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <UpdateFailed error={news.data ? news.error : null} />
      {!news.data ? (
        <Pending error={news.error} rows={10} />
      ) : (
        <ol className="border-t border-ink">
          {news.data.items.map((item) => (
            <li key={item.url} className="grid grid-cols-[56px_1fr] gap-x-3 border-b border-hairline py-2">
              <time dateTime={item.published ?? undefined} className="pt-0.5 font-mono text-[12px] text-muted tabular-nums">
                {formatStamp(item.published)}
              </time>
              <div className="min-w-0">
                <p className="micro-label">{item.source}</p>
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-serif text-[16px] leading-6 font-medium hover:underline">
                  {item.title}
                </a>
                {item.summary && <p className="truncate text-[13px] text-muted">{item.summary}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {failed.length > 0 && (
        <p className="mt-2 text-[12px] text-muted">
          Not included this time: {failed.map((s) => `${s.name} (${s.error})`).join("; ")}
        </p>
      )}
    </Panel>
  );
}
