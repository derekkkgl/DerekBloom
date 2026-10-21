// Heat map shading: three tints of up green or down red by the size of the move.
// Text on a tile is always ink with a sign, so the move reads without color too.

export type Heat = { tone: "up" | "down" | "flat"; step: 0 | 1 | 2 | 3 };

/** Under 1% is step 1, 1 to 3% is step 2, over 3% is step 3. A move that rounds to 0.00% is flat. */
export function heat(changePct: number | null | undefined): Heat {
  if (typeof changePct !== "number" || !Number.isFinite(changePct) || Math.abs(changePct) < 0.005) {
    return { tone: "flat", step: 0 };
  }
  const size = Math.abs(changePct);
  return { tone: changePct > 0 ? "up" : "down", step: size < 1 ? 1 : size < 3 ? 2 : 3 };
}

// Full class names, so Tailwind finds them when it scans the source.
const FILL: Record<string, string> = {
  "up-1": "bg-up-1",
  "up-2": "bg-up-2",
  "up-3": "bg-up-3",
  "down-1": "bg-down-1",
  "down-2": "bg-down-2",
  "down-3": "bg-down-3",
};

export function heatClass({ tone, step }: Heat): string {
  return tone === "flat" ? "bg-paper" : FILL[`${tone}-${step}`];
}

/** The legend, from the biggest fall to the biggest rise. */
export const HEAT_LEGEND: { label: string; heat: Heat }[] = [
  { label: "−3% or more", heat: { tone: "down", step: 3 } },
  { label: "−1 to −3%", heat: { tone: "down", step: 2 } },
  { label: "under −1%", heat: { tone: "down", step: 1 } },
  { label: "under +1%", heat: { tone: "up", step: 1 } },
  { label: "+1 to +3%", heat: { tone: "up", step: 2 } },
  { label: "+3% or more", heat: { tone: "up", step: 3 } },
];
