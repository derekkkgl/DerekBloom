import Link from "next/link";
import type { TerminalFunction } from "@/lib/registry";

/** A ruled list of registered functions: mnemonic, title, and how to type it. */
export function FunctionList({ functions }: { functions: TerminalFunction[] }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-ink text-left">
          <th scope="col" className="micro-label w-20 px-1 py-1 font-normal">Function</th>
          <th scope="col" className="micro-label px-1 py-1 font-normal">What it shows</th>
          <th scope="col" className="micro-label w-28 px-1 py-1 text-right font-normal">Type</th>
        </tr>
      </thead>
      <tbody>
        {functions.map((f) => (
          <tr key={f.mnemonic} className="h-7 border-b border-hairline">
            <td className="px-1 font-mono text-[12px] font-medium">
              {f.needsTicker ? f.mnemonic : <Link href={`/fn/${f.mnemonic}`} className="underline decoration-hairline underline-offset-2 hover:decoration-ink">{f.mnemonic}</Link>}
            </td>
            <td className="px-1">
              <span className="text-ink">{f.title}.</span> <span className="text-muted">{f.description}</span>
            </td>
            <td className="px-1 text-right font-mono text-[12px] text-muted">{f.needsTicker ? `NVDA ${f.mnemonic}` : f.mnemonic}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
