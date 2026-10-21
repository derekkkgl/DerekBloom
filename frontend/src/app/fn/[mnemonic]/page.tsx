import { FunctionScreen } from "@/components/FunctionScreen";
import { FUNCTIONS } from "@/lib/registry";

// One page per registered function, prerendered at build time: /fn/WEI, /fn/CRYPTO ...
export function generateStaticParams() {
  return FUNCTIONS.map((f) => ({ mnemonic: f.mnemonic }));
}

export default async function FunctionPage({ params }: PageProps<"/fn/[mnemonic]">) {
  const { mnemonic } = await params;
  return <FunctionScreen mnemonic={mnemonic} />;
}
