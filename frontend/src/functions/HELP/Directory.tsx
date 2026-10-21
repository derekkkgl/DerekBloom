import { FunctionList } from "@/components/FunctionList";
import { Panel } from "@/components/Panel";
import { SHORTCUTS } from "@/lib/shortcuts";
import { functionsIn, type FunctionScreenProps } from "@/lib/registry";
import { SECTIONS } from "@/lib/sections";

const EXAMPLES: [string, string][] = [
  ["NVDA GP", "a function for one ticker: ticker first, then the function"],
  ["WEI", "a market-wide screen: the function alone"],
  ["NVDA", "a ticker alone opens its description (DES)"],
  ["BTC  ETH  XRP", "coins use short aliases; Yahoo symbols such as 7203.T or ^GSPC work too"],
];

/** HELP: generated from the registry and the shortcut list, so it never goes out of date. */
export function Directory({ mnemonic, title }: FunctionScreenProps) {
  return (
    <Panel title={title} mnemonic={mnemonic}>
      <h3 className="micro-label border-b border-ink pb-1">How to type a command</h3>
      <dl className="mb-4 text-[13px]">
        {EXAMPLES.map(([example, meaning]) => (
          <div key={example} className="grid h-7 grid-cols-[140px_1fr] items-baseline border-b border-hairline px-1 pt-1">
            <dt className="font-mono text-[12px] font-medium">{example}</dt>
            <dd className="text-muted">{meaning}</dd>
          </div>
        ))}
      </dl>

      {SECTIONS.map((section) => {
        const functions = functionsIn(section.id);
        if (functions.length === 0) return null;
        return (
          <section key={section.id} className="mb-4">
            <h3 className="micro-label pb-1 font-medium text-ink">{section.label}</h3>
            <FunctionList functions={functions} />
          </section>
        );
      })}

      <h3 className="micro-label border-b border-ink pb-1">Keyboard</h3>
      <table className="w-full text-[13px]">
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.action} className="h-7 border-b border-hairline">
              <td className="w-56 px-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="mr-2 font-mono text-[12px]">{k}</kbd>
                ))}
              </td>
              <td className="px-1 text-muted">{s.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
