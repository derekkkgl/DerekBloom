"use client";

import { useEffect, useState } from "react";
import { CommitInput } from "@/components/CommitInput";
import { CsvLink } from "@/components/CsvLink";
import { Select } from "@/components/Field";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { apiSend, ApiError, type YieldData, type YieldRow } from "@/lib/api";
import { announcePortfolioChange, onPortfolioChange, yieldSourceLabel } from "@/lib/portfolio";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";

const YIELD_POLL_MS = 60_000;

const HEADINGS: [string, boolean][] = [
  ["Asset", false],
  ["Value", true],
  ["Source", false],
  ["Your rate", true],
  ["Gross / yr", true],
  ["Withheld / yr", true],
  ["Income / yr", true],
  ["Per month", true],
  ["Yield", true],
];

export function CashFlowYield({ mnemonic, title }: FunctionScreenProps) {
  const yld = useApi<YieldData>("/api/yield", YIELD_POLL_MS);
  const reload = yld.reload;
  useEffect(() => onPortfolioChange(reload), [reload]);

  async function save(path: string, method: "PUT" | "DELETE", body?: unknown) {
    await apiSend(method, path, body);
    announcePortfolioChange();
  }

  const y = yld.data;
  return (
    <Panel title={title} mnemonic={mnemonic} meta={yld.meta} actions={<CsvLink path="/api/yield?format=csv" />}>
      <p className="mb-2 max-w-prose text-[13px] text-muted">
        What each holding pays in a year, in pesos. Dividends are Yahoo&apos;s last 12 months per share times your units now, less
        withholding. Rewards are your REWARD rows from the last 12 months, valued on the day each arrived. A rate you set is used only
        when a holding has neither.
      </p>
      <UpdateFailed error={y ? yld.error : null} />
      {!y ? (
        <Pending error={yld.error} rows={5} />
      ) : (
        <>
          <div className="mb-2 flex items-baseline gap-2 text-[13px]">
            <label htmlFor="withholding" className="text-muted">Dividend withholding</label>
            <span className="w-16" id="withholding">
              <CommitInput
                label="Dividend withholding, percent"
                value={y.withholding_pct}
                decimals={1}
                onCommit={(v) => save("/api/settings", "PUT", { withholding_pct: v })}
              />
            </span>
            <span className="font-mono text-[12px] text-muted">%</span>
            <span className="text-[11px] text-muted">US tax on dividends paid to a Philippine resident: 25% under the tax treaty.</span>
          </div>
          {y.rows.length === 0 ? (
            <p className="border-t border-ink py-2 text-[13px] text-muted">No holdings yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead>
                  <tr className="border-t border-ink border-b">
                    {HEADINGS.map(([label, right]) => (
                      <th key={label} scope="col" className={`micro-label px-1.5 py-1 font-normal ${right ? "text-right" : "text-left"}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {y.rows.map((row) => (
                    <YieldLine key={row.asset} row={row} save={save} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="h-7 border-t border-ink">
                    <th scope="row" className="px-1.5 text-left font-medium">Total</th>
                    <td className="px-1.5 text-right"><Num value={y.totals.total_value} decimals={0} currency="PHP" /></td>
                    <td colSpan={2} className="px-1.5 text-[11px] text-muted">
                      incl. cash · <Num value={y.totals.producing_value} decimals={0} currency="PHP" /> earns income
                    </td>
                    <td />
                    <td className="px-1.5 text-right"><Num value={y.totals.withheld_year} decimals={0} currency="PHP" /></td>
                    <td className="px-1.5 text-right font-medium"><Num value={y.totals.income_year} decimals={0} currency="PHP" /></td>
                    <td className="px-1.5 text-right font-medium"><Num value={y.totals.income_month} decimals={2} currency="PHP" /></td>
                    <td className="px-1.5 text-right"><Num value={y.totals.portfolio_yield_pct} percent decimals={2} /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {y.warnings.map((w) => (
            <p key={w} role="status" className="mt-1 text-[11px]">{w}</p>
          ))}
        </>
      )}
    </Panel>
  );
}

function YieldLine({ row, save }: { row: YieldRow; save: (path: string, method: "PUT" | "DELETE", body?: unknown) => Promise<void> }) {
  const settable = row.source === null || row.source === "staking" || row.source === "interest";
  const kind = row.source === "interest" ? "interest" : "staking";
  const path = `/api/yield/${encodeURIComponent(row.asset)}`;
  const [error, setError] = useState<string | null>(null);

  async function choose(value: string) {
    try {
      await (value ? save(path, "PUT", { kind: value, rate_pct: row.rate_pct ?? 0 }) : save(path, "DELETE"));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <tr className="h-8 border-b border-hairline">
      <td className="px-1.5 font-mono text-[12px] font-medium">{row.asset}</td>
      <td className="px-1.5 text-right"><Num value={row.value} decimals={0} currency="PHP" /></td>
      <td className="px-1.5">
        {settable ? (
          <>
            <Select
              aria-label={`${row.asset} income kind`}
              value={row.source ?? ""}
              onChange={(e) => choose(e.target.value)}
              width="w-40"
            >
              <option value="">None</option>
              <option value="staking">Staking, your rate</option>
              <option value="interest">Interest, your rate</option>
            </Select>
            {error && <span role="alert" className="block text-[11px]">{error}</span>}
          </>
        ) : (
          <span>
            {yieldSourceLabel(row.source)}
            {row.dividend_per_share_usd !== null && (
              <span className="ml-2 font-mono text-[11px] text-muted">
                <Num value={row.dividend_per_share_usd} decimals={2} currency="USD" />/share
              </span>
            )}
          </span>
        )}
      </td>
      <td className="w-24 px-1.5 text-right">
        {settable && row.source !== null ? (
          <span className="flex items-baseline gap-1">
            <CommitInput label={`${row.asset} rate, percent a year`} value={row.rate_pct} decimals={2} onCommit={(v) => save(path, "PUT", { kind, rate_pct: v })} />
            <span className="font-mono text-[12px] text-muted">%</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-1.5 text-right"><Num value={row.gross_year} decimals={0} currency="PHP" /></td>
      <td className="px-1.5 text-right">{row.withheld_year ? <Num value={row.withheld_year} decimals={0} currency="PHP" /> : <span className="text-muted">—</span>}</td>
      <td className="px-1.5 text-right"><Num value={row.income_year} decimals={0} currency="PHP" /></td>
      <td className="px-1.5 text-right"><Num value={row.income_month} decimals={2} currency="PHP" /></td>
      <td className="px-1.5 text-right"><Num value={row.yield_pct} percent decimals={2} /></td>
    </tr>
  );
}
