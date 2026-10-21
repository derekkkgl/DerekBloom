import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { HEAT_LEGEND, heat, heatClass } from "@/lib/heat";
import { squarify } from "@/lib/treemap";

export type HeatTile = {
  key: string;
  label: string;
  /** Tile area grows with this (the caller chooses: market cap, its square root, a fund weight ...). */
  weight: number;
  change: number | null;
  /** A second line under the label, such as the market cap. */
  detail?: string;
  href?: string;
};

// Two layouts in their own units: wide (2:1) from the md breakpoint up, tall on phones.
// Each keeps its shape at any width, so tiles are laid out once per layout and CSS picks one.
// `fit` and `roomy` are the tile sizes (in the same units) that have room for two or three lines of text.
type Layout = { width: number; height: number; fit: [number, number]; roomy: [number, number]; className: string };

const LAYOUTS: Layout[] = [
  { width: 200, height: 100, fit: [13, 9], roomy: [22, 16], className: "hidden md:block" },
  { width: 100, height: 140, fit: [14, 10], roomy: [24, 14], className: "md:hidden" },
];

/**
 * Tiles sized by weight and tinted by % change. Each tile shows its label and the change
 * with a sign and arrow in ink; tiles too small for text still carry it in their title and
 * accessible name. The table next to every heat map lists the same numbers.
 */
export function HeatMap({ tiles, label }: { tiles: HeatTile[]; label: string }) {
  return (
    <figure>
      {LAYOUTS.map((layout) => (
        <Tiles key={layout.className} tiles={tiles} label={label} layout={layout} />
      ))}
      <HeatLegend />
    </figure>
  );
}

/** The six tints and what they mean, as a figure caption. Shared with the WMAP tile map. */
export function HeatLegend() {
  return (
    <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
      {HEAT_LEGEND.map(({ label: text, heat: h }) => (
        <span key={text} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`inline-block h-3 w-4 ${heatClass(h)}`} />
          <span className="font-mono">{text}</span>
        </span>
      ))}
    </figcaption>
  );
}

function Tiles({ tiles, label, layout }: { tiles: HeatTile[]; label: string; layout: Layout }) {
  const { width, height } = layout;
  const placed = squarify(tiles.map((t) => ({ item: t, weight: t.weight })), width, height);
  return (
    <div role="list" aria-label={label} className={`relative w-full ${layout.className}`} style={{ aspectRatio: `${width} / ${height}` }}>
      {placed.map(({ item, x, y, w, h }) => {
        const change = formatNumber(item.change, { signed: true, percent: true, decimals: 1 });
        const tone = heat(item.change).tone;
        const arrow = tone === "up" ? "▲ " : tone === "down" ? "▼ " : "";
        const name = `${item.label}: ${change}${item.detail ? `, ${item.detail}` : ""}`;
        const fits = w >= layout.fit[0] && h >= layout.fit[1];
        const roomy = w >= layout.roomy[0] && h >= layout.roomy[1];
        const body = (
          <div className={`h-full overflow-hidden px-1.5 py-1 text-ink ${heatClass(heat(item.change))} ${item.change === null ? "border border-hairline" : ""}`}>
            {fits && (
              <>
                <div className="truncate text-[12px] leading-4 font-medium">{item.label}</div>
                <div className="truncate font-mono text-[11px] leading-4 tabular-nums">
                  <span aria-hidden="true" className="text-[0.8em]">{arrow}</span>
                  {change}
                </div>
                {roomy && item.detail && <div className="truncate font-mono text-[11px] leading-4 tabular-nums">{item.detail}</div>}
              </>
            )}
          </div>
        );
        return (
          <div
            key={item.key}
            role="listitem"
            aria-label={name}
            title={name}
            className="absolute p-px"
            style={{ left: `${(x / width) * 100}%`, top: `${(y / height) * 100}%`, width: `${(w / width) * 100}%`, height: `${(h / height) * 100}%` }}
          >
            {item.href ? (
              <Link href={item.href} className="block h-full hover:outline hover:outline-1 hover:outline-ink">{body}</Link>
            ) : (
              body
            )}
          </div>
        );
      })}
    </div>
  );
}
