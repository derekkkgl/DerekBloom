import { Suspense } from "react";
import { FunctionScreen } from "@/components/FunctionScreen";
import { FUNCTIONS } from "@/lib/registry";

// One page per registered function, prerendered at build time: /fn/WEI, /fn/CRYPTO ...
export function generateStaticParams() {
  return FUNCTIONS.map((f) => ({ mnemonic: f.mnemonic }));
}

// Reading params inside Suspense keeps client navigations between functions instant.
export default function FunctionPage({ params }: PageProps<"/fn/[mnemonic]">) {
  return (
    <Suspense fallback={<p className="micro-label border-t border-ink pt-2">Loading</p>}>
      {params.then(({ mnemonic }) => (
        <FunctionScreen mnemonic={mnemonic} />
      ))}
    </Suspense>
  );
}
