"use client";

import { useDisplayCurrency, type DisplayCurrency } from "@/lib/currency";

const OPTIONS: DisplayCurrency[] = ["USD", "PHP"];

/** Global PHP/USD switch. The choice is remembered in this browser. */
export function CurrencyToggle() {
  const [currency, setCurrency] = useDisplayCurrency();

  return (
    <div role="group" aria-label="Display currency" className="flex items-baseline gap-2 font-mono text-[12px]">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={currency === option}
          onClick={() => setCurrency(option)}
          className={`border-b-2 pb-0.5 ${
            currency === option ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
