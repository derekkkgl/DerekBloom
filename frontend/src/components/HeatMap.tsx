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

// Layout units. The map keeps this shape at every width, so tiles are laid out once.
const WIDTH = 200;
const HEIGHT = 100;

/**
 * Tiles sized by weight and tinted by % change. Each tile shows its label and the change
 * with a sign and arrow in ink; tiles too small for text still carry it in their title and
 * accessible name. The table next to every heat map lists the same numbers.
 */
export function HeatMap({ tiles, label }: { tiles: HeatTile[]; label: string }) {
  const placed = squarify(tiles.map((t) => ({ item: t, weight: t.weight })), WIDTH, HEIGHT);
  return (
    <figure>
      <div role="list" aria-label={label} className="relative w-full" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
        {placed.map(({ item, x, y, w, h }) => {
          const change = formatNumber(item.change, { signed: true, percent: true, decimals: 2 });
          const arrow = item.change === null ? "" : heat(item.change).tone === "up" ? "▲ " : heat(item.change).tone === "down" ? "▼ " : "";
          const name = `${item.label}: ${change}${item.detail ? `, ${item.detail}` : ""}`;
          const roomy = w >= 22 && h >= 16;
          const fits = w >= 13 && h >= 9;
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
              style={{ left: `${(x / WIDTH) * 100}%`, top: `${(y / HEIGHT) * 100}%`, width: `${(w / WIDTH) * 100}%`, height: `${(h / HEIGHT) * 100}%` }}
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
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        {HEAT_LEGEND.map(({ label: text, heat: h }) => (
          <span key={text} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block h-3 w-4 ${heatClass(h)}`} />
            <span className="font-mono">{text}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
