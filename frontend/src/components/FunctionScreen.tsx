import { notFound } from "next/navigation";
import { isTicker } from "@/lib/command";
import { getFunction } from "@/lib/registry";
import { Panel } from "./Panel";

/** Renders a registered function inside its Panel, after checking the ticker makes sense. */
export function FunctionScreen({ mnemonic, ticker }: { mnemonic: string; ticker?: string }) {
  const fn = getFunction(mnemonic);
  if (!fn) notFound();

  const symbol = ticker?.toUpperCase();
  const Screen = fn.component;

  let message: string | null = null;
  if (fn.needsTicker && !symbol) message = `${fn.mnemonic} needs a ticker. Type, for example, NVDA ${fn.mnemonic} in Look up.`;
  else if (!fn.needsTicker && symbol) message = `${fn.mnemonic} is market-wide and doesn't take a ticker. Type ${fn.mnemonic} in Look up.`;
  else if (symbol && !isTicker(symbol)) message = `"${ticker}" isn't a valid ticker. Tickers use letters, digits, and . - ^ =`;

  return (
    <Panel title={fn.title} mnemonic={fn.mnemonic} ticker={message ? undefined : symbol}>
      {message ? <p className="text-[13px] text-muted">{message}</p> : <Screen ticker={symbol} />}
    </Panel>
  );
}
