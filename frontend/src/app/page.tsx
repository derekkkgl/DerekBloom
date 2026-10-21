import { CryptoColumn, Headlines, IndicesColumn, UsColumn } from "@/components/FrontPage";

// The front page: US stocks and ETFs lead, crypto and world indices beside them,
// headlines across the bottom. What each column lists is set in lib/frontPage.ts.
export default function Home() {
  return (
    <>
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-[2fr_1fr_1fr]">
        <UsColumn />
        <CryptoColumn />
        <IndicesColumn />
      </div>
      <Headlines />
    </>
  );
}
