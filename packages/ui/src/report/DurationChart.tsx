import type { CSSProperties, ReactElement } from 'react';
import { DataTable, Figure } from './Figure.js';
import { formatCount } from './format.js';
import type { DurationBin } from './landed.js';
import { bandScale, linearScale, round } from './scales.js';

const AXIS_STYLE: CSSProperties = { stroke: 'var(--border)' };
const ACCENT_FILL: CSSProperties = { fill: 'var(--accent)' };
const MUTED_STYLE: CSSProperties = { fill: 'var(--muted)' };
const TEXT_STYLE: CSSProperties = { fill: 'var(--text)' };

const WIDTH = 720;
const HEIGHT = 220;
const MARGIN = { top: 24, right: 16, bottom: 56, left: 56 };
const PLOT_TOP = MARGIN.top;
const PLOT_BOTTOM = HEIGHT - MARGIN.bottom;
const PLOT_LEFT = MARGIN.left;
const PLOT_RIGHT = WIDTH - MARGIN.right;

export interface DurationChartProps {
  readonly bins: readonly DurationBin[];
}

/** Distribution of covered task durations over fixed deterministic bins. */
export function DurationChart({ bins }: DurationChartProps): ReactElement {
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  const max = bins.reduce((current, bin) => Math.max(current, bin.count), 0);
  const y = linearScale(0, max, PLOT_BOTTOM, PLOT_TOP);
  const bands = bandScale(bins.length, PLOT_LEFT, PLOT_RIGHT, 0.3);
  const barWidth = bands.length > 0 ? bands[0].size * 0.7 : 0;

  return (
    <Figure
      id="durations"
      title="Covered task durations"
      question="How are the covered task durations distributed across observed duration ranges?"
      summary={
        <DataTable
          caption="Covered task durations per deterministic bin"
          columns={['Duration bin', 'Covered tasks']}
          rows={bins.map((bin) => ({
            key: bin.label,
            cells: [bin.label, formatCount(bin.count)],
          }))}
          emptyText="No covered task duration is available."
        />
      }
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label="Covered task durations"
      >
        <title>Covered task durations</title>
        <desc>
          Counts of finite non-negative covered task durations in fixed bins. Uncovered tasks never
          contribute an estimated duration.
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
        {total === 0 ? (
          <text x={PLOT_LEFT + 8} y={PLOT_TOP + 16} fontSize={10} style={MUTED_STYLE}>
            Covered task durations are unavailable.
          </text>
        ) : null}
        {bins.map((bin, index) => {
          const band = bands[index];
          if (!band) return null;
          const top = y(bin.count);
          const barHeight = Math.max(0, PLOT_BOTTOM - top);
          return (
            <g key={bin.label}>
              <rect
                x={round(band.center - barWidth / 2)}
                y={round(top)}
                width={round(barWidth)}
                height={round(barHeight)}
                style={ACCENT_FILL}
              >
                <title>{`${bin.label}: ${formatCount(bin.count)} covered tasks`}</title>
              </rect>
              <text
                x={round(band.center)}
                y={round(top - 5)}
                textAnchor="middle"
                fontSize={9}
                style={TEXT_STYLE}
              >
                {formatCount(bin.count)}
              </text>
              <text
                x={round(band.center)}
                y={PLOT_BOTTOM + 14}
                textAnchor="middle"
                fontSize={8}
                style={MUTED_STYLE}
              >
                {bin.label}
              </text>
            </g>
          );
        })}
      </svg>
    </Figure>
  );
}
