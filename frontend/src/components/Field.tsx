import type { ButtonHTMLAttributes, ComponentProps } from "react";

// Inputs are a single ink bottom rule on the paper, never a box (see CLAUDE.md, Controls).
// Width is its own prop: two width classes on one element fight, and the wrong one can win.
const RULED = "min-w-0 border-0 border-b border-ink bg-transparent px-1 py-0.5 text-[12px] placeholder:text-muted/70 disabled:border-hairline disabled:text-muted";

type Sized = { width?: string }; // a Tailwind width class, "w-full" unless given

export function TextInput({ mono = true, width = "w-full", className = "", ...props }: ComponentProps<"input"> & Sized & { mono?: boolean }) {
  return <input type="text" autoComplete="off" spellCheck={false} {...props} className={`${RULED} ${width} ${mono ? "font-mono tabular-nums" : ""} ${className}`} />;
}

export function Select({ width = "w-full", className = "", children, ...props }: ComponentProps<"select"> & Sized) {
  return (
    <select {...props} className={`${RULED} ${width} cursor-pointer appearance-none pr-3 ${className}`}>
      {children}
    </select>
  );
}

/** A text button: muted ink, ink on hover. `active` gets the 2px ink underline. */
export function TextButton({
  active = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`border-b-2 text-[12px] disabled:opacity-50 ${active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"} ${className}`}
    />
  );
}
