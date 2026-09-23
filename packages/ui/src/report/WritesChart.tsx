import type { CSSProperties, ReactElement } from 'react';
import { DataTable, Figure } from './Figure.js';
import { formatCount, formatLanded } from './format.js';
import type { CapabilitySeries, LandedChange } from './landed.js';
import { bandScale, labelStep, linearScale, round, stepPath } from './scales.js';

const WIDTH = 720;
const HEIGHT = 240;
const MARGIN = { top: 24, right: 24, bottom: 64, left: 56 };
const PLOT_TOP = MARGIN.top;
const PLOT_BOTTOM = HEIGHT - MARGIN.bottom;
const PLOT_LEFT = MARGIN.left;
const PLOT_RIGHT = WIDTH - MARGIN.right;
const DASHES = ['', '6 3', '2 3', '8 3 2 3'];
const MIN_LABEL_GAP = 24;
const AXIS_STYLE: CSSProperties = { stroke: 'var(--border)' };
const ACCENT_STROKE: CSSProperties = { stroke: 'var(--accent)' };
const ACCENT_FILL: CSSProperties = { fill: 'var(--accent)' };
const MUTED_STYLE: CSSProperties = { fill: 'var(--muted)' };
const TEXT_STYLE: CSSProperties = { fill: 'var(--text)' };

export interface WritesChartProps {
  readonly series: readonly CapabilitySeries[];
  readonly changes: readonly LandedChange[];
}

/** The change number alone, for the thinned x axis. */
function changeNumber(change: LandedChange): string {
  const id = change.id ?? Number.parseInt(change.folderKey, 10);
  return Number.isFinite(id) ? String(id) : change.folderKey;
}

/** The first and last landed change that wrote one capability. */
function writeWindow(
  entry: CapabilitySeries,
  changes: readonly LandedChange[],
): { first: LandedChange | undefined; last: LandedChange | undefined } {
  let first: LandedChange | undefined;
  let last: LandedChange | undefined;
  entry.points.forEach((point, index) => {
    if (point.cumulative <= 0) return;
    first ??= changes[index];
    last = changes[index];
  });
  return { first, last };
}

/** Cumulative capability writes over recorded landed time. */
export function WritesChart({ series, changes }: WritesChartProps): ReactElement {
  const max = series.reduce((current, entry) => Math.max(current, entry.total), 0);
  const y = linearScale(0, max, PLOT_BOTTOM, PLOT_TOP);
  const bands = bandScale(changes.length, PLOT_LEFT, PLOT_RIGHT, 0.1);
  const spacing = bands.length > 1 ? bands[1].center - bands[0].center : Number.POSITIVE_INFINITY;
  const tickStep = labelStep(spacing, MIN_LABEL_GAP);

  return (
    <Figure
      id="writes"
      title="Cumulative capability writes"
      question="How did cumulative capability writes grow across landed changes?"
      summary={
        <DataTable
          caption="Cumulative landed writes per capability in stable order"
          columns={['Capability', 'Cumulative writes', 'First landed write', 'Last landed write']}
          rows={series.map((entry) => {
            const { first, last } = writeWindow(entry, changes);
            return {
              key: entry.id,
              cells: [
                entry.id,
                formatCount(entry.total),
                first ? `${first.folderKey} (${formatLanded(first.landed)})` : 'unavailable',
                last ? `${last.folderKey} (${formatLanded(last.landed)})` : 'unavailable',
              ],
            };
          })}
          emptyText="No landed change writes a capability."
        />
      }
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label="Cumulative capability writes"
      >
        <title>Cumulative capability writes</title>
        <desc>
          One step line per capability counting unique writes edges across landed changes in time
          order. Capability order follows the current capability document.
        </desc>
        <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} style={AXIS_STYLE} />
        <text
          x={PLOT_LEFT - 6}
          y={round(y(max) + 3)}
          textAnchor="end"
          fontSize={9}
          style={MUTED_STYLE}
        >
          {formatCount(max)}
        </text>
        <text
          x={PLOT_LEFT - 6}
          y={PLOT_BOTTOM + 3}
          textAnchor="end"
          fontSize={9}
          style={MUTED_STYLE}
        >
          0
        </text>
        {changes.map((change, index) => {
          const band = bands[index];
          if (!band) return null;
          return (
            <g key={change.folderKey} className="report-writes-band">
              <title>{change.folderKey}</title>
              {index % tickStep === 0 ? (
                <text
                  className="report-writes-tick"
                  x={round(band.center)}
                  y={PLOT_BOTTOM + 14}
                  textAnchor="middle"
                  fontSize={8}
                  style={MUTED_STYLE}
                >
                  {changeNumber(change)}
                </text>
              ) : null}
            </g>
          );
        })}
        {series.length === 0 ? (
          <text x={PLOT_LEFT + 8} y={PLOT_TOP + 16} fontSize={10} style={MUTED_STYLE}>
            Cumulative capability writes are unavailable.
          </text>
        ) : null}
        {series.map((entry, seriesIndex) => {
          const points = entry.points
            .map((point, index) => {
              const band = bands[index];
              return band ? { x: band.center, y: y(point.cumulative) } : null;
            })
            .filter((point): point is { x: number; y: number } => point !== null);
          const last = points[points.length - 1];
          return (
            <g key={entry.id} className="report-writes-series">
              <path
                d={stepPath(points)}
                fill="none"
                strokeWidth={2}
                strokeDasharray={DASHES[seriesIndex % DASHES.length] || undefined}
                style={ACCENT_STROKE}
              >
                <title>{`${entry.id}: ${formatCount(entry.total)} cumulative writes`}</title>
              </path>
              {points.map((point, index) => (
                <circle
                  key={`${entry.id}:${entry.points[index]?.change ?? index}`}
                  cx={round(point.x)}
                  cy={round(point.y)}
                  r={2.5}
                  style={ACCENT_FILL}
                >
                  <title>{`${entry.id} at ${entry.points[index]?.change}: ${formatCount(entry.points[index]?.cumulative ?? 0)} cumulative writes`}</title>
                </circle>
              ))}
              {last ? (
                <text x={round(last.x + 5)} y={round(last.y + 3)} fontSize={9} style={TEXT_STYLE}>
                  {entry.id} ({formatCount(entry.total)})
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </Figure>
  );
}
