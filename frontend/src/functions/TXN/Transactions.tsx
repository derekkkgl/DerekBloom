"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CsvLink } from "@/components/CsvLink";
import { Select, TextButton, TextInput } from "@/components/Field";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { apiSend, ApiError, combineMeta, type Account, type Transaction } from "@/lib/api";
import { priceDecimals, unitDecimals } from "@/lib/format";
import {
  accountCurrency,
  announcePortfolioChange,
  CASH_CURRENCIES,
  emptyForm,
  formFromTransaction,
  isCashCurrency,
  manilaToday,
  onPortfolioChange,
  toInput,
  TX_TYPES,
  typeFields,
  type TxForm,
} from "@/lib/portfolio";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";

const HEADINGS: [string, string][] = [
  ["Date", "w-[118px] text-left"],
  ["Account", "w-[96px] text-left"],
  ["Type", "w-[92px] text-left"],
  ["Asset", "w-[84px] text-left"],
  ["Units / amount", "w-[110px] text-right"],
  ["Price", "w-[150px] text-right"],
  ["Fee", "w-[120px] text-right"],
  ["Pesos", "w-[120px] text-right"],
  ["Note", "text-left"],
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

  const accountList = accounts.data?.accounts ?? [];
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
    if (e.target !== e.currentTarget) return; // keys typed into a button or input belong to it
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
      <p className="mb-2 max-w-prose text-[13px] text-muted">
        Every trade, reward, and deposit, newest first. What matters is what you bought, how much, and at what price (plus any
        fee). Dollar trades get their peso cost from Yahoo&apos;s USD/PHP on the trade date; Coins.ph buys are priced in pesos.
      </p>
      <UpdateFailed error={list.data ? list.error : null} />
      {!list.data || !accounts.data ? (
        <Pending error={list.error ?? accounts.error} rows={6} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] table-fixed text-[13px]">
            <thead>
              <tr className="border-b border-ink">
                {HEADINGS.map(([label, cls]) => (
                  <th key={label} scope="col" className={`micro-label px-1.5 py-1 font-normal ${cls}`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <EntryRow formId="txn-new" accounts={accountList} submitLabel="Add" resetAfterSave />
            </tbody>
            <tbody className="border-t-[3px] border-double border-ink">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={HEADINGS.length} className="px-1.5 py-2 text-muted">
                    No transactions yet. Start with your first buy.
                  </td>
                </tr>
              )}
              {rows.map((tx) =>
                editing === tx.id ? (
                  <EntryRow
                    key={tx.id}
                    formId={`txn-${tx.id}`}
                    accounts={accountList}
                    initial={formFromTransaction(tx)}
                    txId={tx.id}
                    submitLabel="Save"
                    onDone={() => setEditing(null)}
                  />
                ) : (
                  <TxRow
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
      )}
      {rowError && (
        <p role="alert" className="mt-2 text-[13px]">
          <span className="micro-label mr-2 text-ink">Not deleted</span>
          {rowError}
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Keyboard: Tab to a row, then ↑ ↓ to move, E to edit, Delete to remove, Esc to cancel. Enter saves the entry row.
      </p>
    </Panel>
  );
}

// --- One saved transaction ----------------------------------------------------

function TxRow(props: {
  tx: Transaction;
  confirming: boolean;
  onKey: (e: KeyboardEvent<HTMLTableRowElement>) => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const { tx } = props;
  const fields = typeFields(tx.type);
  const feeIn = tx.fee_currency && tx.fee_currency !== tx.price_currency ? tx.fee_currency : null;

  return (
    <tr
      data-row
      tabIndex={0}
      onKeyDown={props.onKey}
      aria-label={`${tx.trade_date} ${tx.type} ${tx.asset}`}
      className="h-7 border-b border-hairline focus:bg-ink/[0.04]"
    >
      <td className="px-1.5 font-mono text-[12px]">{tx.trade_date}</td>
      <td className="truncate px-1.5">{tx.account}</td>
      <td className="px-1.5 font-mono text-[12px] text-muted">{tx.type}</td>
      <td className="px-1.5 font-mono text-[12px] font-medium">{tx.asset}</td>
      <td className="px-1.5 text-right">
        <Num value={tx.units} decimals={fields.unitsLabel === "Units" ? unitDecimals(tx.units) : 2} />
      </td>
      <td className="px-1.5 text-right">
        {tx.price !== null ? <Num value={tx.price} decimals={priceDecimals(tx.asset, tx.price)} currency={tx.price_currency} /> : <span className="text-muted">—</span>}
        {tx.type === "DIVIDEND" && <span className="font-mono text-[11px] text-muted">{tx.price_currency}</span>}
      </td>
      <td className="px-1.5 text-right">
        {tx.fee ? (
          <>
            <Num value={tx.fee} decimals={unitDecimals(tx.fee)} />
            <span className="ml-1 font-mono text-[11px] text-muted">{feeIn ?? tx.price_currency}</span>
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-1.5 text-right">
        {tx.peso_amount !== null ? (
          <Num value={tx.peso_amount} decimals={0} currency="PHP" />
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="truncate px-1.5 text-muted" title={tx.note ?? undefined}>
        {tx.note}
      </td>
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
  );
}

// --- The entry row (also used to edit a row in place) ---------------------------

function EntryRow(props: {
  formId: string;
  accounts: Account[];
  initial?: TxForm;
  txId?: number;
  submitLabel: string;
  resetAfterSave?: boolean;
  onDone?: () => void;
}) {
  const { accounts, formId } = props;
  const [form, setForm] = useState<TxForm>(() => props.initial ?? emptyForm(manilaToday(), accounts[0]));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const assetRef = useRef<HTMLInputElement>(null);
  const fields = typeFields(form.type);
  const accountName = (id: string) => accounts.find((a) => String(a.id) === id)?.name;
  const set = (patch: Partial<TxForm>) => setForm((f) => ({ ...f, ...patch }));

  function changeAccount(id: string) {
    const currency = accountCurrency(accountName(id));
    const cashAsset = typeFields(form.type).pesos && (form.asset === "" || isCashCurrency(form.asset));
    set({ account_id: id, price_currency: currency, ...(cashAsset ? { asset: currency } : {}) });
  }

  function changeType(type: TxForm["type"]) {
    const cash = typeFields(type).pesos;
    const assetIsCash = isCashCurrency(form.asset);
    const asset = cash && (form.asset === "" || assetIsCash) ? accountCurrency(accountName(form.account_id)) : !cash && assetIsCash ? "" : form.asset;
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
        set({ asset: fields.pesos ? form.asset : "", units: "", price: "", fee: "", fee_currency: "", php_amount: "", note: "" });
        assetRef.current?.focus();
      }
      announcePortfolioChange();
      props.onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const cancelOnEsc = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.onDone) {
      e.preventDefault();
      props.onDone();
    }
  };
  const common = { form: formId, onKeyDown: cancelOnEsc, disabled: busy };

  return (
    <>
      <tr className="h-8 align-bottom" aria-label={props.txId === undefined ? "New transaction" : "Edit transaction"}>
        <td className="px-1.5 pb-1">
          <form id={formId} onSubmit={save} />
          <TextInput {...common} type="date" aria-label="Date" value={form.trade_date} max={manilaToday()} onChange={(e) => set({ trade_date: e.target.value })} />
        </td>
        <td className="px-1.5 pb-1">
          <Select {...common} aria-label="Account" value={form.account_id} onChange={(e) => changeAccount(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1.5 pb-1">
          <Select {...common} aria-label="Type" value={form.type} onChange={(e) => changeType(e.target.value as TxForm["type"])} className="font-mono">
            {TX_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1.5 pb-1">
          <TextInput {...common} ref={assetRef} aria-label="Asset" placeholder={fields.asset} value={form.asset} onChange={(e) => set({ asset: e.target.value.toUpperCase() })} className="uppercase" />
        </td>
        <td className="px-1.5 pb-1">
          <TextInput {...common} inputMode="decimal" aria-label={fields.unitsLabel} placeholder={fields.unitsLabel} value={form.units} onChange={(e) => set({ units: e.target.value })} className="text-right" />
        </td>
        <td className="px-1.5 pb-1">
          {fields.price ? (
            <div className="flex gap-1">
              <TextInput {...common} inputMode="decimal" aria-label="Price per unit" placeholder={form.type === "REWARD" ? "optional" : "per unit"} value={form.price} onChange={(e) => set({ price: e.target.value })} className="text-right" />
              <CurrencySelect {...common} value={form.price_currency} onChange={(v) => set({ price_currency: v })} />
            </div>
          ) : form.type === "DIVIDEND" ? (
            <div className="flex justify-end">
              <CurrencySelect {...common} value={form.price_currency} onChange={(v) => set({ price_currency: v })} label="Dividend currency" />
            </div>
          ) : null}
        </td>
        <td className="px-1.5 pb-1">
          {fields.fee && (
            <div className="flex gap-1">
              <TextInput {...common} inputMode="decimal" aria-label="Fee" placeholder="fee" value={form.fee} onChange={(e) => set({ fee: e.target.value })} className="text-right" />
              {fields.feeCurrency ? (
                <TextInput {...common} aria-label="Fee currency" placeholder={form.price_currency} value={form.fee_currency} onChange={(e) => set({ fee_currency: e.target.value.toUpperCase() })} width="w-12" className="shrink-0 uppercase" />
              ) : (
                <span className="self-end font-mono text-[11px] text-muted">{form.asset || "coin"}</span>
              )}
            </div>
          )}
        </td>
        <td className="px-1.5 pb-1">
          {fields.pesos ? (
            <TextInput
              {...common}
              inputMode="decimal"
              aria-label={form.type === "DEPOSIT" ? "Pesos sent, optional" : "Pesos received, optional"}
              placeholder={form.type === "DEPOSIT" ? "₱ sent (opt.)" : "₱ received (opt.)"}
              value={form.php_amount}
              onChange={(e) => set({ php_amount: e.target.value })}
              className="text-right"
            />
          ) : (
            <span className="block text-right text-[11px] text-muted">{form.price_currency === "PHP" ? "price × units" : "at Yahoo rate"}</span>
          )}
        </td>
        <td className="px-1.5 pb-1">
          <TextInput {...common} mono={false} aria-label="Note" placeholder="note" value={form.note} onChange={(e) => set({ note: e.target.value })} />
        </td>
        <td className="px-1.5 pb-1 text-right whitespace-nowrap">
          <button type="submit" form={formId} disabled={busy} className="border-b-2 border-ink text-[12px] text-ink disabled:opacity-50">
            {props.submitLabel} <span aria-hidden="true">⏎</span>
          </button>
          {props.onDone && (
            <TextButton onClick={props.onDone} className="ml-2">
              Cancel
            </TextButton>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={HEADINGS.length} className="px-1.5 pb-1">
            <p role="alert" className="text-[13px]">
              <span className="micro-label mr-2 text-ink">Not saved</span>
              {error}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function CurrencySelect(props: {
  value: TxForm["price_currency"];
  onChange: (value: TxForm["price_currency"]) => void;
  label?: string;
  form: string;
  disabled: boolean;
  onKeyDown: (e: KeyboardEvent) => void;
}) {
  return (
    <Select
      form={props.form}
      disabled={props.disabled}
      onKeyDown={props.onKeyDown}
      aria-label={props.label ?? "Price currency"}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as TxForm["price_currency"])}
      width="w-16"
      className="shrink-0 font-mono"
    >
      {CASH_CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </Select>
  );
}
