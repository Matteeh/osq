import type { ReactElement } from 'react';
import { DataTable, Figure } from './Figure.js';
import { formatCount, formatRate } from './format.js';
import type { PassWindow } from './landed.js';
import { bandScale, linearScale, round } from './scales.js';

const WIDTH = 720;
const HEIGHT = 220;
const MARGIN = { top: 24, right: 16, bottom: 56, left: 56 };
const PLOT_TOP = MARGIN.top;
const PLOT_BOTTOM = HEIGHT - MARGIN.bottom;
const PLOT_LEFT = MARGIN.left;
const PLOT_RIGHT = WIDTH - MARGIN.right;

export interface PassChartProps {
  readonly windows: readonly PassWindow[];
}

/** First-attempt task pass rate over consecutive landed windows of at most five. */
export function PassChart({ windows }: PassChartProps): ReactElement {
  const y = linearScale(0, 1, PLOT_BOTTOM, PLOT_TOP);
  const bands = bandScale(windows.length, PLOT_LEFT, PLOT_RIGHT, 0.35);
  const barWidth = bands.length > 0 ? bands[0].size * 0.6 : 0;

  return (
    <Figure
      id="pass"
      title="First-attempt pass windows"
      question="In consecutive landed windows of at most five changes, how many tasks passed on their first attempt?"
      summary={
        <DataTable
          caption="First-attempt task passes and denominator per consecutive landed window"
          columns={[
            'Window',
            'Landed changes',
            'Passed first attempt',
            'Tasks with attempts',
            'Rate',
          ]}
          rows={windows.map((window) => ({
            key: `window-${window.index}`,
            cells: [
              `Window ${window.index}`,
              formatCount(window.changes.length),
              formatCount(window.reported),
              formatCount(window.total),
              formatRate(window.reported, window.total),
            ],
          }))}
          emptyText="No landed change carries task attempts."
        />
      }
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label="First-attempt pass rate"
      >
        <title>First-attempt pass windows</title>
        <desc>
          Bars of first-attempt task pass rate over consecutive landed windows of at most five
          changes. A window with no task attempts is labelled unavailable.
        </desc>
        <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke="#8a8a86" />
        {windows.length === 0 ? (
          <text x={PLOT_LEFT + 8} y={PLOT_TOP + 16} fontSize={10}>
            No landed change carries a first-attempt observation.
          </text>
        ) : null}
        {[0, 0.5, 1].map((tick) => (
          <g key={`pass-tick-${tick}`}>
            <line
              x1={PLOT_LEFT}
              y1={round(y(tick))}
              x2={PLOT_RIGHT}
              y2={round(y(tick))}
              stroke="#d7d7d2"
            />
            <text x={PLOT_LEFT - 6} y={round(y(tick) + 3)} textAnchor="end" fontSize={9}>
              {formatRate(tick, 1)}
            </text>
          </g>
        ))}
        {windows.map((window, index) => {
          const band = bands[index];
          if (!band) return null;
          const available = window.rate !== null;
          const top = available ? y(window.rate ?? 0) : PLOT_BOTTOM;
          const barHeight = available ? Math.max(0, PLOT_BOTTOM - top) : 0;
          return (
            <g key={`window-${window.index}`}>
              {available ? (
                <rect
                  x={round(band.center - barWidth / 2)}
                  y={round(top)}
                  width={round(barWidth)}
                  height={round(barHeight)}
                  fill="#2f5d8a"
                >
                  <title>{`Window ${window.index}: ${formatRate(window.reported, window.total)} (${formatCount(window.reported)} of ${formatCount(window.total)})`}</title>
                </rect>
              ) : (
                <rect
                  x={round(band.center - barWidth / 2)}
                  y={PLOT_BOTTOM - 3}
                  width={round(barWidth)}
                  height={3}
                  fill="#b9b9b4"
                >
                  <title>{`Window ${window.index}: unavailable`}</title>
                </rect>
              )}
              <text x={round(band.center)} y={round(top - 5)} textAnchor="middle" fontSize={9}>
                {formatRate(window.reported, window.total)}
              </text>
              <text x={round(band.center)} y={PLOT_BOTTOM + 14} textAnchor="middle" fontSize={8}>
                W{window.index} ({window.changes.length})
              </text>
            </g>
          );
        })}
      </svg>
    </Figure>
  );
}
