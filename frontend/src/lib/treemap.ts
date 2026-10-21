// Squarified treemap layout: split a rectangle into tiles whose areas match their weights,
// keeping each tile as close to square as possible (Bruls, Huizing, van Wijk, 2000).
// Used by the heat maps. No library: it is one short loop.

export type Tile<T> = { item: T; x: number; y: number; w: number; h: number };

type Sized<T> = { item: T; area: number };

/**
 * Lay out items in a width × height box. Items with no positive weight are left out.
 * Tiles come back largest first, in the box's own units.
 */
export function squarify<T>(items: { item: T; weight: number }[], width: number, height: number): Tile<T>[] {
  const valid = items.filter((i) => Number.isFinite(i.weight) && i.weight > 0).sort((a, b) => b.weight - a.weight);
  const total = valid.reduce((sum, i) => sum + i.weight, 0);
  if (!total || width <= 0 || height <= 0) return [];

  const scale = (width * height) / total;
  const queue: Sized<T>[] = valid.map((i) => ({ item: i.item, area: i.weight * scale }));
  const tiles: Tile<T>[] = [];
  const box = { x: 0, y: 0, w: width, h: height };
  let row: Sized<T>[] = [];

  while (queue.length) {
    const side = Math.min(box.w, box.h);
    const next = queue[0];
    if (row.length === 0 || worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
      queue.shift();
    } else {
      placeRow(row, box, tiles);
      row = [];
    }
  }
  if (row.length) placeRow(row, box, tiles);
  return tiles;
}

/** The worst (largest) aspect ratio in a row laid along a side of this length. */
function worst<T>(row: Sized<T>[], side: number): number {
  const sum = row.reduce((s, r) => s + r.area, 0);
  const max = Math.max(...row.map((r) => r.area));
  const min = Math.min(...row.map((r) => r.area));
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/** Put a row along the box's shorter side, then shrink the box past it. */
function placeRow<T>(row: Sized<T>[], box: { x: number; y: number; w: number; h: number }, out: Tile<T>[]) {
  const sum = row.reduce((s, r) => s + r.area, 0);
  if (box.w >= box.h) {
    const w = sum / box.h; // a column on the left
    let y = box.y;
    for (const r of row) {
      const h = r.area / w;
      out.push({ item: r.item, x: box.x, y, w, h });
      y += h;
    }
    box.x += w;
    box.w -= w;
  } else {
    const h = sum / box.w; // a row along the top
    let x = box.x;
    for (const r of row) {
      const w = r.area / h;
      out.push({ item: r.item, x, y: box.y, w, h });
      x += w;
    }
    box.y += h;
    box.h -= h;
  }
}
