import Link from "next/link";
import { HeatLegend } from "@/components/HeatMap";
import { direction, formatNumber } from "@/lib/format";
import { heat, heatClass } from "@/lib/heat";
import { gridSize } from "@/lib/world";

export type MapTile = {
  key: string;
  /** Short code on the tile (US, JP). */
  code: string;
  /** The longer name, shown on wide screens and read by screen readers. */
  label: string;
  change: number | null;
  col: number;
  row: number;
  href?: string;
};

/**
 * Same-size squares placed roughly where each market sits on the globe, tinted by % change.
 * Every tile shows its code and the change with a sign and arrow in ink, so it reads without color.
 */
export function TileMap({ tiles, label }: { tiles: MapTile[]; label: string }) {
  const { cols, rows } = gridSize(tiles);
  return (
    <figure>
      <div
        role="list"
        aria-label={label}
        className="grid max-w-[760px] gap-0.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)` }}
      >
        {tiles.map((tile) => {
          const change = formatNumber(tile.change, { signed: true, percent: true, decimals: 1 });
          const dir = direction(tile.change, 1); // follows the rounded number, so "0.0%" gets no arrow
          const arrow = dir > 0 ? "▲" : dir < 0 ? "▼" : "";
          const name = `${tile.label}: ${tile.change === null ? "no change available" : change}`;
          const body = (
            <div
              className={`flex aspect-square flex-col justify-between overflow-hidden p-0.5 text-ink sm:p-1.5 ${heatClass(heat(tile.change))} ${tile.change === null ? "border border-hairline" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="font-mono text-[10px] font-medium sm:text-[12px]">{tile.code}</span>
                <span aria-hidden="true" className="hidden text-[0.7em] sm:inline">{arrow}</span>
              </div>
              <div className="hidden truncate text-[11px] leading-4 md:block">{tile.label}</div>
              <div className="font-mono text-[10px] leading-3 tabular-nums sm:text-[12px] sm:leading-4">{change}</div>
            </div>
          );
          return (
            <div key={tile.key} role="listitem" aria-label={name} title={name} style={{ gridColumn: tile.col + 1, gridRow: tile.row + 1 }}>
              {tile.href ? (
                <Link href={tile.href} className="block hover:outline hover:outline-1 hover:outline-ink">{body}</Link>
              ) : (
                body
              )}
            </div>
          );
        })}
      </div>
      <HeatLegend />
    </figure>
  );
}
