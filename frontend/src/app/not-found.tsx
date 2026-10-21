import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";

export default function NotFound() {
  return (
    <div className="border-t border-ink pt-3">
      <PageTitle title="Not in today's paper" standfirst="That page or function doesn't exist." />
      <p className="text-[13px] text-muted">
        Press <kbd className="font-mono text-ink">/</kbd> to look up a function, or go back to the{" "}
        <Link href="/" className="text-ink underline underline-offset-2">front page</Link>.
      </p>
    </div>
  );
}
