"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { CommitInput } from "@/components/CommitInput";
import { CsvLink } from "@/components/CsvLink";
import { TextButton } from "@/components/Field";
import { INK, MUTED } from "@/components/Chart";
import { LineChart, type Line } from "@/components/LineChart";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { Stat, StatList } from "@/components/StatList";
import { apiSend, type Goal, type Settings } from "@/lib/api";
import { announcePortfolioChange, formatDuration, formatMonth, onPortfolioChange, projectionSeries } from "@/lib/portfolio";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";

const GOAL_POLL_MS = 60_000;

export function IncomeGoal({ mnemonic, title }: FunctionScreenProps) {
  const goal = useApi<Goal>("/api/goal", GOAL_POLL_MS);
  const reload = goal.reload;
  useEffect(() => onPortfolioChange(reload), [reload]);

  async function update(patch: Partial<Settings>) {
    await apiSend("PUT", "/api/settings", patch);
    announcePortfolioChange();
  }

  const g = goal.data;
  return (
    <Panel title={title} mnemonic={mnemonic} meta={goal.meta} actions={<CsvLink path="/api/goal?format=csv" label="CSV (projection)" />}>
      <UpdateFailed error={g ? goal.error : null} />
      {!g ? <Pending error={goal.error} rows={6} /> : <GoalBody g={g} update={update} />}
    </Panel>
  );
}

function GoalBody({ g, update }: { g: Goal; update: (patch: Partial<Settings>) => Promise<void> }) {
  const s = g.settings;
  const includeAll = Boolean(s.goal_include_all);
  const lines = useMemo<Line[]>(() => {
    const capital = projectionSeries(g.projection);
    const out: Line[] = [{ label: "Projected capital", color: INK, data: capital }];
    if (g.capital_needed !== null) {
      out.push({ label: "Capital needed", color: MUTED, dashed: true, data: capital.map((p) => ({ time: p.time, value: g.capital_needed as number })) });
    }
    return out;
  }, [g.projection, g.capital_needed]);

  return (
    <>
      {/* Hero: income now against the target */}
      <div className="border-t border-ink pt-2 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Num value={g.income_now_month} decimals={2} currency="PHP" className="text-[32px] leading-10 font-medium" />
          <span className="text-[15px]">a month now</span>
          <span className="text-[15px] text-muted">
            of <Num value={s.target_monthly_php} decimals={0} currency="PHP" /> target
          </span>
          <Num value={g.progress_pct} percent decimals={1} className="text-[15px]" />
          <span className="text-[15px] text-muted">there</span>
        </div>
        <p className="text-[13px] text-muted">
          Income now is what your holdings actually pay (YLD below), after withholding. If converted:{" "}
          <Num value={g.if_converted_month} decimals={2} currency="PHP" className="text-ink" /> a month, hypothetical, if everything you
          hold earned <Num value={s.assumed_yield_pct} percent decimals={1} />.
        </p>
      </div>

      {/* Inputs */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-hairline py-2 text-[13px]">
        <Setting label="Target per month" prefix="₱">
          <CommitInput label="Target income per month, pesos" value={s.target_monthly_php} decimals={0} onCommit={(v) => update({ target_monthly_php: v ?? undefined })} />
        </Setting>
        <Setting label="You add per month" prefix="₱">
          <CommitInput label="Monthly contribution, pesos" value={s.contribution_monthly_php} decimals={0} onCommit={(v) => update({ contribution_monthly_php: v ?? undefined })} />
        </Setting>
        <Setting label="Assumed yield" suffix="% a year">
          <CommitInput label="Assumed yield, percent a year" value={s.assumed_yield_pct} decimals={2} onCommit={(v) => update({ assumed_yield_pct: v ?? undefined })} />
        </Setting>
      </div>
      <div role="group" aria-label="Capital that counts toward the goal" className="flex flex-wrap items-baseline gap-3 border-b border-hairline pb-2 text-[13px]">
        <span className="text-muted">Count toward the goal:</span>
        <TextButton active={!includeAll} aria-pressed={!includeAll} onClick={() => update({ goal_include_all: false })}>
          Income-producing holdings
        </TextButton>
        <TextButton active={includeAll} aria-pressed={includeAll} onClick={() => update({ goal_include_all: true })}>
          Everything
        </TextButton>
      </div>

      {/* Key figures */}
      <div className="mt-3 grid grid-cols-1 gap-y-3 md:grid-cols-2 [&>*]:md:px-4 [&>*:first-child]:md:pl-0 [&>*:last-child]:md:pr-0 [&>*+*]:md:border-l [&>*+*]:md:border-hairline">
        <StatList title="Capital">
          <Stat label="Needed at the assumed yield"><Num value={g.capital_needed} decimals={0} currency="PHP" /></Stat>
          <Stat label={includeAll ? "Everything you hold" : "Income-producing now"}><Num value={g.start_capital} decimals={0} currency="PHP" /></Stat>
          <Stat label="Still to build"><Num value={g.capital_gap} decimals={0} currency="PHP" /></Stat>
        </StatList>
        <StatList title="Time">
          <Stat label="Months to goal"><Num value={g.months_to_goal} decimals={0} /></Stat>
          <Stat label="That is">{formatDuration(g.months_to_goal)}</Stat>
          <Stat label="Target date"><span className="font-mono">{formatMonth(g.target_date)}</span></Stat>
        </StatList>
      </div>
      {g.note && (
        <p role="status" className="mt-2 text-[13px]">
          <span className="micro-label mr-2 text-ink">Note</span>
          {g.note}
        </p>
      )}

      {/* Projected path */}
      <div className="mt-4 border-t border-ink pt-2">
        <h3 className="micro-label pb-1">Projected path</h3>
        <LineChart lines={lines} currency="PHP" decimals={0} label="Projected capital by month against the capital needed for the income target" />
        <p className="mt-1 text-[11px] text-muted">
          Each month, capital grows by the assumed yield ÷ 12 (income reinvested), then your contribution is added. Prices don&apos;t
          move in this projection; it shows the effect of saving and yield only.
        </p>
      </div>
    </>
  );
}

function Setting({ label, prefix, suffix, children }: { label: string; prefix?: string; suffix?: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="mr-1 text-muted">{label}</span>
      {prefix && <span className="font-mono text-[12px] text-muted">{prefix}</span>}
      <span className="w-20">{children}</span>
      {suffix && <span className="font-mono text-[12px] text-muted">{suffix}</span>}
    </div>
  );
}
