/**
 * Small deterministic geometry helpers shared by the report figures. Every
 * function tolerates empty, singleton, all-zero, and non-finite input by
 * returning a finite fallback rather than `NaN` or `Infinity`.
 */

/** Rounds to two decimals so server-rendered SVG marks stay byte-stable. */
export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A finite linear mapping from a data domain onto a pixel range. A singleton
 * domain is widened around its value; an all-zero domain maps zero to the
 * range minimum so bars rest on the baseline.
 */
export function linearScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): (value: number) => number {
  const lo = Number.isFinite(domainMin) ? domainMin : 0;
  const hi = Number.isFinite(domainMax) ? domainMax : lo;
  let min = Math.min(lo, hi);
  let max = Math.max(lo, hi);
  if (min === max) {
    if (min === 0) {
      max = 1;
    } else {
      const pad = Math.abs(min) * 0.5 || 1;
      min -= pad;
      max += pad;
    }
  }
  const span = max - min;
  const rangeSpan = rangeMax - rangeMin;
  return (value: number): number => {
    if (!Number.isFinite(value)) return rangeMin;
    return rangeMin + ((value - min) / span) * rangeSpan;
  };
}

/** One evenly spaced horizontal band within a pixel range. */
export interface Band {
  readonly start: number;
  readonly size: number;
  readonly center: number;
}

/** Evenly spaced bands across a range; an empty or negative count yields none. */
export function bandScale(
  count: number,
  rangeMin: number,
  rangeMax: number,
  gapRatio = 0.25,
): Band[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  const span = Math.max(0, rangeMax - rangeMin);
  const step = span / count;
  const gap = Math.min(Math.max(gapRatio, 0), 0.9);
  const size = step * (1 - gap);
  return Array.from({ length: Math.trunc(count) }, (_, index) => {
    const start = rangeMin + index * step + (step - size) / 2;
    return { start, size, center: start + size / 2 };
  });
}

/** One point in SVG user space. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** An SVG polyline point list, or an empty string when there is no point. */
export function polylinePoints(points: readonly Point[]): string {
  return points.map((point) => `${round(point.x)},${round(point.y)}`).join(' ');
}

/** A step path through points, or an empty string when there is no point. */
export function stepPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  let path = `M ${round(points[0].x)} ${round(points[0].y)}`;
  for (let index = 1; index < points.length; index += 1) {
    path += ` H ${round(points[index].x)} V ${round(points[index].y)}`;
  }
  return path;
}
