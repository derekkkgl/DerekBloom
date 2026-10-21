import { Suspense } from "react";
import { FunctionScreen } from "@/components/FunctionScreen";

// A function for one ticker: /fn/GP/NVDA. Tickers are only known when a request
// arrives, so the screen renders inside Suspense (required with Cache Components).
export default function TickerFunctionPage({ params }: PageProps<"/fn/[mnemonic]/[ticker]">) {
  return (
    <Suspense fallback={<p className="micro-label border-t border-ink pt-2">Loading</p>}>
      {params.then(({ mnemonic, ticker }) => (
        <FunctionScreen mnemonic={mnemonic} ticker={decodeURIComponent(ticker)} />
      ))}
    </Suspense>
  );
}
