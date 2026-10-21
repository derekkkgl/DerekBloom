/**
 * A tiny 1px ink line of recent prices, no axes. Decorative: the % change next to it
 * carries the meaning (and the color and arrow), so screen readers skip it.
 */
export function Sparkline({ values, width = 72, height = 18 }: { values: number[]; width?: number; height?: number }) {
  const points = values.filter((v) => Number.isFinite(v));
  if (points.length < 2) return <span className="inline-block" style={{ width, height }} aria-hidden="true" />;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const path = points.map((v, i) => `${(i * step).toFixed(1)},${(height - 1 - ((v - min) / span) * (height - 2)).toFixed(1)}`).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="inline-block align-middle">
      <polyline points={path} fill="none" stroke="var(--color-ink)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
