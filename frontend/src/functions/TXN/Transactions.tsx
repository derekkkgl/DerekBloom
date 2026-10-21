"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { CsvLink } from "@/components/CsvLink";
import { Select, TextButton, TextInput } from "@/components/Field";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { TickerInput } from "@/components/TickerInput";
import { apiSend, ApiError, combineMeta, type Account, type CashCurrency, type Transaction } from "@/lib/api";
import { priceDecimals, unitDecimals } from "@/lib/format";
import {
  accountCurrency,
  accountOptions,
  announcePortfolioChange,
  CASH_CURRENCIES,
  defaultAccount,
  emptyForm,
  formFromTransaction,
  isCashCurrency,
  manilaToday,
  NO_ACCOUNT,
  onPortfolioChange,
  toInput,
  TX_TYPES,
  txTotal,
  TYPE_WORDS,
  typeFields,
  type TxForm,
} from "@/lib/portfolio";
import type { FunctionScreenProps } from "@/lib/registry";
import { HOLDABLE_TYPES } from "@/lib/search";
import { useApi } from "@/lib/useApi";

const HEADINGS: [string, string][] = [
  ["Date", "w-[104px] text-left"],
  ["Account", "w-[104px] text-left"],
  ["Type", "w-[84px] text-left"],
  ["Asset", "w-[96px] text-left"],
  ["Units", "text-right"],
  ["Price", "text-right"],
  ["Fee", "text-right"],
  ["Total", "text-right"],
  ["", "w-[104px]"],
];

export function Transactions({ mnemonic, title }: FunctionScreenProps) {
  const list = useApi<{ transactions: Transaction[] }>("/api/transactions");
  const accounts = useApi<{ accounts: Account[] }>("/api/accounts");
  const [editing, setEditing] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const reloadList = list.reload;
  const reloadAccounts = accounts.reload;

  useEffect(
    () =>
      onPortfolioChange(() => {
        reloadList();
        reloadAccounts();
      }),
    [reloadList, reloadAccounts],
  );

  const accountList = accountOptions(accounts.data?.accounts ?? []);
  const rows = list.data?.transactions ?? [];

  async function remove(id: number) {
    try {
      await apiSend("DELETE", `/api/transactions/${id}`);
      setConfirming(null);
      setRowError(null);
      announcePortfolioChange();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : String(err));
    }
  }

  function onRowKey(e: KeyboardEvent<HTMLTableRowElement>, tx: Transaction) {
    if (e.target !== e.currentTarget) return; // keys typed into a button belong to it
    const move = (step: number) => {
      const all = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLTableRowElement>("tr[data-row]") ?? []);
      all[all.indexOf(e.currentTarget) + step]?.focus();
    };
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "e" || e.key === "E") setEditing(tx.id);
    else if (e.key === "Delete" || e.key === "Backspace") setConfirming(tx.id);
    else if (e.key === "Escape") setConfirming(null);
    else return;
    e.preventDefault();
  }

  return (
    <Panel title={title} mnemonic={mnemonic} meta={combineMeta(list.meta, accounts.meta)} actions={<CsvLink path="/api/transactions?format=csv" />}>
      <UpdateFailed error={list.data ? list.error : null} />
      {!list.data || !accounts.data ? (
        <Pending error={list.error ?? accounts.error} rows={6} />
      ) : (
        <>
          <EntryLine accounts={accountList} submitLabel="Add" resetAfterSave />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-t border-ink border-b">
                  {HEADINGS.map(([label, cls]) => (
                    <th key={label} scope="col" className={`micro-label px-1.5 py-1 font-normal ${cls}`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={HEADINGS.length} className="px-1.5 py-2 text-muted">
                      No transactions yet. Type your first one in the line above, e.g. Bought 0.0021978 BTC.
                    </td>
                  </tr>
                )}
                {rows.map((tx) =>
                  editing === tx.id ? (
                    <tr key={tx.id} className="border-b border-hairline bg-ink/[0.03]">
                      <td colSpan={HEADINGS.length} className="px-1.5 py-2">
                        <EntryLine accounts={accountList} initial={formFromTransaction(tx)} txId={tx.id} submitLabel="Save" onDone={() => setEditing(null)} />
                      </td>
                    </tr>
                  ) : (
                    <LedgerRow
                      key={tx.id}
                      tx={tx}
                      confirming={confirming === tx.id}
                      onKey={(e) => onRowKey(e, tx)}
                      onEdit={() => {
                        setConfirming(null);
                        setEditing(tx.id);
                      }}
                      onAskDelete={() => setConfirming(tx.id)}
                      onDelete={() => remove(tx.id)}
                      onCancel={() => {
                        setConfirming(null);
                        setRowError(null);
                      }}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>
          {rowError && (
            <p role="alert" className="mt-2 text-[13px]">
              <span className="micro-label mr-2 text-ink">Not deleted</span>
              {rowError}
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted">
            Only the units and the asset are needed. With a price, PORT also shows cost and P&amp;L; dollar prices convert to pesos at
            Yahoo&apos;s USD/PHP on the trade date. Keyboard: Tab to a row, then ↑ ↓ to move, E to edit, Delete to remove.
          </p>
        </>
      )}
    </Panel>
  );
}

// --- One saved transaction ------------------------------------------------------

function LedgerRow(props: {
  tx: Transaction;
  confirming: boolean;
  onKey: (e: KeyboardEvent<HTMLTableRowElement>) => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const { tx } = props;
  const isCash = tx.type === "DEPOSIT" || tx.type === "WITHDRAW" || tx.type === "DIVIDEND";
  const feeIn = tx.fee_currency ?? tx.price_currency;
  const total = txTotal(tx);
  const dash = <span className="text-muted">—</span>;

  return (
    <Fragment>
      <tr
        data-row
        tabIndex={0}
        onKeyDown={props.onKey}
        aria-label={`${tx.trade_date} ${tx.type} ${tx.asset}`}
        className={`h-7 focus:bg-ink/[0.04] ${tx.note ? "" : "border-b border-hairline"}`}
      >
        <td className="px-1.5 font-mono text-[12px]">{tx.trade_date}</td>
        <td className={`truncate px-1.5 ${tx.account === NO_ACCOUNT ? "text-muted" : ""}`}>{tx.account === NO_ACCOUNT ? "—" : tx.account}</td>
        <td className="px-1.5 font-mono text-[12px] text-muted">{tx.type}</td>
        <td className="px-1.5 font-mono text-[12px] font-medium">{tx.asset}</td>
        <td className="px-1.5 text-right">
          <Num value={tx.units} decimals={isCash ? 2 : unitDecimals(tx.units)} />
          {tx.type === "DIVIDEND" && <span className="ml-1 font-mono text-[11px] text-muted">{tx.price_currency}</span>}
        </td>
        <td className="px-1.5 text-right">{tx.price !== null ? <Num value={tx.price} decimals={priceDecimals(tx.asset, tx.price)} currency={tx.price_currency} /> : dash}</td>
        <td className="px-1.5 text-right">
          {tx.fee ? (
            <>
              <Num value={tx.fee} decimals={unitDecimals(tx.fee)} />
              <span className="ml-1 font-mono text-[11px] text-muted">{feeIn}</span>
            </>
          ) : (
            dash
          )}
        </td>
        <td className="px-1.5 text-right">{total ? <Num value={total.value} decimals={total.currency === "PHP" ? 0 : 2} currency={total.currency} /> : dash}</td>
        <td className="px-1.5 text-right whitespace-nowrap">
          {props.confirming ? (
            <span className="text-[12px]">
              Delete?{" "}
              <TextButton onClick={props.onDelete} className="ml-1 text-ink" autoFocus>
                Yes
              </TextButton>{" "}
              <TextButton onClick={props.onCancel} className="ml-1">
                No
              </TextButton>
            </span>
          ) : (
            <>
              <TextButton onClick={props.onEdit}>Edit</TextButton>{" "}
              <TextButton onClick={props.onAskDelete} className="ml-2">
                Delete
              </TextButton>
            </>
          )}
        </td>
      </tr>
      {tx.note && (
        <tr className="border-b border-hairline">
          <td />
          <td colSpan={HEADINGS.length - 1} className="truncate px-1.5 pb-1 text-[12px] leading-4 text-muted">
            {tx.note}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// --- The entry line (also used to edit a row in place) ---------------------------

function Word({ children }: { children: ReactNode }) {
  return <span className="text-muted">{children}</span>;
}

function EntryLine(props: {
  accounts: Account[];
  initial?: TxForm;
  txId?: number;
  submitLabel: string;
  resetAfterSave?: boolean;
  onDone?: () => void;
}) {
  const { accounts } = props;
  const [form, setForm] = useState<TxForm>(() => props.initial ?? emptyForm(manilaToday(), defaultAccount(accounts)));
  const [shown, setShown] = useState(() => ({
    price: Boolean(props.initial?.price),
    fee: Boolean(props.initial?.fee),
    pesos: Boolean(props.initial?.php_amount),
    note: Boolean(props.initial?.note),
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unitsRef = useRef<HTMLInputElement>(null);
  const fields = typeFields(form.type);
  const words = TYPE_WORDS[form.type];
  const isCash = fields.pesos; // DEPOSIT, WITHDRAW: the asset is a currency
  const accountName = (id: string) => accounts.find((a) => String(a.id) === id)?.name;
  const set = (patch: Partial<TxForm>) => setForm((f) => ({ ...f, ...patch }));
  const reveal = (key: keyof typeof shown) => setShown((s) => ({ ...s, [key]: true }));

  function changeAccount(id: string) {
    const currency = accountCurrency(accountName(id));
    set({ account_id: id, price_currency: currency, ...(isCash && (form.asset === "" || isCashCurrency(form.asset)) ? { asset: currency } : {}) });
  }

  function changeType(type: TxForm["type"]) {
    const cash = typeFields(type).pesos;
    const assetIsCash = isCashCurrency(form.asset);
    const asset = cash && (form.asset === "" || !assetIsCash) ? accountCurrency(accountName(form.account_id)) : !cash && assetIsCash ? "" : form.asset;
    set({ type, asset });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const result = toInput(form);
    if ("problem" in result) {
      setError(result.problem);
      return;
    }
    setBusy(true);
    try {
      if (props.txId === undefined) await apiSend("POST", "/api/transactions", result.input);
      else await apiSend("PUT", `/api/transactions/${props.txId}`, result.input);
      setError(null);
      if (props.resetAfterSave) {
        // Keep the date, account, type, and currency for the next entry.
        set({ asset: isCash ? form.asset : "", units: "", price: "", fee: "", fee_currency: "", php_amount: "", note: "" });
        setShown({ price: false, fee: false, pesos: false, note: false });
        unitsRef.current?.focus();
      }
      announcePortfolioChange();
      props.onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && props.onDone) {
      e.preventDefault();
      props.onDone();
    }
  }
  const common = { onKeyDown, disabled: busy };
  const noAccount = accountName(form.account_id) === NO_ACCOUNT;

  return (
    <form onSubmit={save} aria-label={props.txId === undefined ? "New transaction" : "Edit transaction"} className="text-[13px]">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-2">
        <Select {...common} aria-label="Type" value={form.type} onChange={(e) => changeType(e.target.value as TxForm["type"])} width="w-28" className="font-medium">
          {TX_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_WORDS[t].label}
            </option>
          ))}
        </Select>
        {words.verb !== words.label && <Word>{words.verb.toLowerCase()}</Word>}
        <TextInput
          {...common}
          ref={unitsRef}
          inputMode="decimal"
          aria-label={fields.unitsLabel}
          placeholder={fields.unitsLabel === "Units" ? "units" : "amount"}
          value={form.units}
          onChange={(e) => set({ units: e.target.value })}
          width="w-28"
          className="text-right"
        />
        {isCash ? (
          <CurrencySelect {...common} label="Currency" value={isCashCurrency(form.asset) ? form.asset : "USD"} onChange={(v) => set({ asset: v })} />
        ) : form.type === "DIVIDEND" ? (
          <>
            <CurrencySelect {...common} label="Dividend currency" value={form.price_currency} onChange={(v) => set({ price_currency: v })} />
            <Word>from</Word>
            <TickerInput {...common} label="Paid by" placeholder="ticker" value={form.asset} onChange={(v) => set({ asset: v })} types={HOLDABLE_TYPES} />
          </>
        ) : (
          <TickerInput {...common} label="Asset" placeholder="ticker" value={form.asset} onChange={(v) => set({ asset: v })} types={HOLDABLE_TYPES} />
        )}
        <Word>{noAccount ? "·" : words.linker}</Word>
        <Select {...common} aria-label="Account (optional)" value={form.account_id} onChange={(e) => changeAccount(e.target.value)} width="w-32" className={noAccount ? "text-muted" : ""}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name === NO_ACCOUNT ? "any account" : a.name}
            </option>
          ))}
        </Select>
        <Word>·</Word>
        <TextInput {...common} type="date" aria-label="Date" value={form.trade_date} max={manilaToday()} onChange={(e) => set({ trade_date: e.target.value })} width="w-36" />
        <span className="ml-auto flex items-baseline gap-3">
          <button type="submit" disabled={busy} className="border-b-2 border-ink text-[13px] text-ink disabled:opacity-50">
            {props.submitLabel} <span aria-hidden="true">⏎</span>
          </button>
          {props.onDone && <TextButton onClick={props.onDone}>Cancel</TextButton>}
        </span>
      </div>

      {/* Optional details, tucked away until wanted */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        {fields.price &&
          (shown.price ? (
            <span className="flex items-baseline gap-2">
              <Word>at</Word>
              <TextInput {...common} inputMode="decimal" aria-label="Price per unit" placeholder="price" value={form.price} onChange={(e) => set({ price: e.target.value })} width="w-28" className="text-right" autoFocus={!props.initial} />
              <CurrencySelect {...common} label="Price currency" value={form.price_currency} onChange={(v) => set({ price_currency: v })} />
              <Word>per unit</Word>
            </span>
          ) : (
            <TextButton onClick={() => reveal("price")}>+ price</TextButton>
          ))}
        {fields.fee &&
          (shown.fee ? (
            <span className="flex items-baseline gap-2">
              <Word>{form.type === "TRANSFER" ? "network fee" : "fee"}</Word>
              <TextInput {...common} inputMode="decimal" aria-label="Fee" placeholder="fee" value={form.fee} onChange={(e) => set({ fee: e.target.value })} width="w-20" className="text-right" autoFocus={!props.initial} />
              {fields.feeCurrency ? (
                <TextInput {...common} aria-label="Fee currency" placeholder={form.price_currency} value={form.fee_currency} onChange={(e) => set({ fee_currency: e.target.value.toUpperCase() })} width="w-16" className="uppercase" />
              ) : (
                <span className="font-mono text-[12px] text-muted">{form.asset || "coin"}</span>
              )}
            </span>
          ) : (
            <TextButton onClick={() => reveal("fee")}>+ fee</TextButton>
          ))}
        {fields.pesos &&
          (shown.pesos ? (
            <span className="flex items-baseline gap-2">
              <Word>{form.type === "DEPOSIT" ? "pesos sent" : "pesos received"}</Word>
              <TextInput {...common} inputMode="decimal" aria-label={form.type === "DEPOSIT" ? "Pesos sent" : "Pesos received"} placeholder="₱" value={form.php_amount} onChange={(e) => set({ php_amount: e.target.value })} width="w-28" className="text-right" autoFocus={!props.initial} />
            </span>
          ) : (
            <TextButton onClick={() => reveal("pesos")}>+ pesos</TextButton>
          ))}
        {shown.note ? (
          <span className="flex min-w-[16rem] flex-1 items-baseline gap-2">
            <Word>note</Word>
            <TextInput {...common} mono={false} aria-label="Note" placeholder="why, where, anything" value={form.note} onChange={(e) => set({ note: e.target.value })} autoFocus={!props.initial} />
          </span>
        ) : (
          <TextButton onClick={() => reveal("note")}>+ note</TextButton>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2">
          <span className="micro-label mr-2 text-ink">Not saved</span>
          {error}
        </p>
      )}
    </form>
  );
}

function CurrencySelect(props: {
  value: CashCurrency;
  onChange: (value: CashCurrency) => void;
  label: string;
  disabled: boolean;
  onKeyDown: (e: KeyboardEvent) => void;
}) {
  return (
    <Select
      disabled={props.disabled}
      onKeyDown={props.onKeyDown}
      aria-label={props.label}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as CashCurrency)}
      width="w-16"
      className="font-mono"
    >
      {CASH_CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </Select>
  );
}
