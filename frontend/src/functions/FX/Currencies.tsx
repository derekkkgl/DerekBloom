"use client";

import Link from "next/link";
import { CsvLink } from "@/components/CsvLink";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { Sparkline } from "@/components/Sparkline";
import type { Fx, FxRow } from "@/lib/api";
import { commandHref } from "@/lib/command";
import { formatDate } from "@/lib/format";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";
import { useRowLink } from "@/lib/useRowLink";
import { rateDecimals } from "@/lib/world";

const FX_POLL_MS = 60_000; // currencies are cached 60 seconds

const HEADINGS: [string, boolean][] = [
  ["Currency", false],
  ["Per US$1", true],
  ["vs US$", true],
  ["In pesos", true],
  ["vs peso", true],
  ["1 month in pesos", true],
  ["Date", true],
];

/** The Yahoo pair that prices this currency in pesos, for its chart. */
function pesoPair(code: string): string {
  return code === "USD" ? "PHP=X" : `${code}PHP=X`;
}

export function Currencies({ mnemonic, title }: FunctionScreenProps) {
  const fx = useApi<Fx>("/api/fx", FX_POLL_MS);
  const rowLink = useRowLink();
  const f = fx.data;

  return (
    <>
      <Panel title={title} mnemonic={mnemonic} meta={fx.meta} actions={<CsvLink path="/api/fx?format=csv" />}>
        <p className="mb-2 text-[13px] text-muted">
          What each currency is worth in dollars and in pesos. A plus sign means that currency got stronger: against the dollar in &ldquo;vs
          US$&rdquo;, against the peso in &ldquo;vs peso&rdquo;. A row opens its chart in pesos.
        </p>
        <UpdateFailed error={f ? fx.error : null} />
        {!f ? (
          <Pending error={fx.error} rows={9} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="border-b border-ink">
                    {HEADINGS.map(([label, right]) => (
                      <th key={label} scope="col" className={`micro-label px-1.5 py-1 font-normal ${right ? "text-right" : "text-left"}`}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {f.rows.map((row: FxRow) => {
                    const href = commandHref({ mnemonic: "GP", ticker: pesoPair(row.code) });
                    const link = rowLink(href);
                    return (
                      <tr key={row.code} onClick={link.onClick} className={`h-7 border-b border-hairline ${link.className}`}>
                        <td className="px-1.5">
                          <Link href={href} className="hover:underline">
                            <span className="font-mono text-[12px] font-medium">{row.code}</span>
                            <span className="ml-2 text-muted">{row.name}</span>
                          </Link>
                        </td>
                        <td className="px-1.5 text-right"><Num value={row.per_usd} decimals={rateDecimals(row.per_usd)} /></td>
                        <td className="px-1.5 text-right"><Num value={row.change_pct} change percent decimals={2} /></td>
                        <td className="px-1.5 text-right"><Num value={row.in_php} decimals={rateDecimals(row.in_php)} currency="PHP" /></td>
                        <td className="px-1.5 text-right"><Num value={row.in_php_change_pct} change percent decimals={2} /></td>
                        <td className="px-1.5 text-right"><Sparkline values={row.closes_php} /></td>
                        <td className="px-1.5 text-right font-mono text-[12px] text-muted">{formatDate(row.last_date, { year: false })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-3 text-[13px]">
              <Link href={commandHref({ mnemonic: "GP", ticker: "DX-Y.NYB" })} className="hover:underline">US dollar index (DXY)</Link>
              <Num value={f.dxy.last} decimals={2} />
              <Num value={f.dxy.change_pct} change percent decimals={2} />
              <span className="text-[11px] text-muted">The dollar against six major currencies, mostly the euro. Up means a stronger dollar.</span>
            </p>
          </>
        )}
      </Panel>
      {f && <CrossRates fx={f} />}
    </>
  );
}

function CrossRates({ fx }: { fx: Fx }) {
  const { codes, rows } = fx.matrix;
  return (
    <Panel title="Cross rates" mnemonic="FX">
      <p className="mb-2 text-[13px] text-muted">
        How much of the currency on top one unit of the currency on the left buys. Read along the PHP column for prices in pesos.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[12px]">
          <thead>
            <tr className="border-b border-ink">
              <th scope="col" className="micro-label px-1.5 py-1 text-left font-normal">1 unit of</th>
              {codes.map((code) => (
                <th key={code} scope="col" className="micro-label px-1.5 py-1 text-right font-normal">{code}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.base} className="h-7 border-b border-hairline">
                <th scope="row" className="px-1.5 text-left font-mono text-[12px] font-medium">{row.base}</th>
                {codes.map((code) => {
                  const value = row[code] as number | null;
                  return (
                    <td key={code} className="px-1.5 text-right">
                      {code === row.base ? <span className="font-mono text-muted">1</span> : <Num value={value} decimals={rateDecimals(value)} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Worked out from each currency&apos;s latest close against the dollar, so markets that closed at different times are mixed. Yahoo quotes; no
        bank or remittance spread.
      </p>
    </Panel>
  );
}
