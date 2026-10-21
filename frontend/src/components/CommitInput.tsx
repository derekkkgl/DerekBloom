"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { parseAmount } from "@/lib/portfolio";
import { TextInput } from "./Field";

/**
 * A number you set in place (cash, goal settings, rates). It saves when you press Enter or
 * leave the field, and only if the number changed. Esc puts back the saved value. If the
 * backend refuses, its message shows under the field and the saved value comes back.
 */
export function CommitInput({
  value,
  onCommit,
  label,
  decimals = 2,
  allowBlank = false,
  className = "",
}: {
  value: number | null;
  onCommit: (value: number | null) => Promise<unknown>;
  label: string;
  decimals?: number;
  allowBlank?: boolean;
  className?: string;
}) {
  const shown = value === null ? "" : String(Number(value.toFixed(decimals)));
  const [draft, setDraft] = useState<string | null>(null); // null: not editing, show the saved value
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function commit() {
    if (draft === null) return;
    const next = parseAmount(draft);
    if (Number.isNaN(next) || (next === null && !allowBlank)) {
      setError("Enter a number.");
      return;
    }
    if (next === value || (next !== null && value !== null && Number(next.toFixed(decimals)) === Number(value.toFixed(decimals)))) {
      setDraft(null);
      setError(null);
      return;
    }
    setBusy(true);
    try {
      await onCommit(next);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setDraft(null);
      setBusy(false);
    }
  }

  return (
    <span className="inline-block w-full">
      <TextInput
        inputMode="decimal"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        value={draft ?? shown}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(null);
            setError(null);
          }
        }}
        className={`text-right ${className}`}
      />
      {error && (
        <span role="alert" className="block text-left text-[11px] leading-4 whitespace-normal text-ink">
          {error}
        </span>
      )}
    </span>
  );
}
