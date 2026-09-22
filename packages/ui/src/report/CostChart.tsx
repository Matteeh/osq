import type { ReactElement } from 'react';
import { DataTable, Figure } from './Figure.js';
import { compactCost, costWithCoverage, formatCost, formatLanded } from './format.js';
import type { LandedChange } from './landed.js';
import { bandScale, linearScale, round } from './scales.js';

const WIDTH = 720;
const HEIGHT = 240;
const MARGIN = { top: 24, right: 16, bottom: 64, left: 72 };
const PLOT_TOP = MARGIN.top;
const PLOT_BOTTOM = HEIGHT - MARGIN.bottom;
const PLOT_LEFT = MARGIN.left;
const PLOT_RIGHT = WIDTH - MARGIN.right;

export interface CostChartProps {
  readonly changes: readonly LandedChange[];
  readonly boundaryIndex: number;
}

interface CostMarkProps {
  readonly x: number;
  readonly width: number;
  readonly value: number;
  readonly coverage: { readonly reported: number; readonly total: number };
  readonly kind: 'execution' | 'planning';
  readonly y: (value: number) => number;
}

/** One cost mark with an adjacent compact value and coverage label. */
function CostMark({ x, width, value, coverage, kind, y }: CostMarkProps): ReactElement {
  const top = y(value);
  const height = Math.max(0, PLOT_BOTTOM - top);
  const fill = kind === 'execution' ? '#2f5d8a' : 'url(#cost-planning-hatch)';
  const label = compactCost(value, coverage);
  return (
    <g>
      {height > 0 ? (
        <rect x={round(x)} y={round(top)} width={round(width)} height={round(height)} fill={fill}>
          <title>{`${kind} cost ${label}`}</title>
        </rect>
      ) : (
        <rect
          x={round(x)}
          y={PLOT_BOTTOM - 1.5}
          width={round(width)}
          height={3}
          fill={fill}
          className="report-zero-mark"
        >
          <title>{`${kind} cost ${label}`}</title>
        </rect>
      )}
      <text
        x={round(x + width / 2)}
        y={round(top - 3)}
        textAnchor="middle"
        fontSize={8}
        fill="currentColor"
      >
        {label}
      </text>
    </g>
  );
}

/** Execution and planning cost per landed change over recorded landed time. */
export function CostChart({ changes, boundaryIndex }: CostChartProps): ReactElement {
  const values: number[] = [];
  for (const change of changes) {
    if (change.executionCost !== null) values.push(change.executionCost);
    if (change.planningCost !== null) values.push(change.planningCost);
  }
  const max = values.length > 0 ? Math.max(...values) : 0;
  const y = linearScale(0, max, PLOT_BOTTOM, PLOT_TOP);
  const bands = bandScale(changes.length, PLOT_LEFT, PLOT_RIGHT, 0.2);
  const slot = bands.length > 0 ? bands[0].size / 2 : 0;
  const barWidth = slot * 0.8;
  const boundary =
    boundaryIndex >= 0 && boundaryIndex < changes.length ? changes[boundaryIndex] : null;

  return (
    <Figure
      id="cost"
      title="Landed cost"
      question="How much reported execution and planning cost did each landed change accumulate?"
      summary={
        <>
          <DataTable
            caption="Reported execution and planning cost per landed change with exact coverage"
            columns={['Change', 'Landed', 'Execution cost', 'Planning cost']}
            rows={changes.map((change) => ({
              key: change.folderKey,
              cells: [
                change.title,
                formatLanded(change.landed),
                costWithCoverage(change.executionCost, change.executionCoverage, 'attempts'),
                costWithCoverage(change.planningCost, change.planningCoverage, 'sessions'),
              ],
            }))}
            emptyText="No landed change carries a recorded date."
          />
          {boundary === null ? (
            <p className="report-note">
              No change has a valid planning record; planning cost is unavailable.
            </p>
          ) : (
            <p className="report-note">
              Planning records begin at change {boundary.folderKey}; no planning mark is drawn
              before it.
            </p>
          )}
        </>
      }
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label="Cost per landed change"
      >
        <title>Landed cost</title>
        <desc>
          Stacked execution and planning cost marks per landed change, ordered by recorded landed
          time. Planning marks begin only at the first change with a valid planning record.
        </desc>
        <defs>
          <pattern id="cost-planning-hatch" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M0,6 L6,0" stroke="#8a5a2f" strokeWidth="1.5" />
          </pattern>
        </defs>
        <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke="#8a8a86" />
        {[0, max / 2, max].map((tick) => (
          <g key={`tick-${tick}`}>
            <line
              x1={PLOT_LEFT}
              y1={round(y(tick))}
              x2={PLOT_RIGHT}
              y2={round(y(tick))}
              stroke="#d7d7d2"
            />
            <text x={PLOT_LEFT - 6} y={round(y(tick) + 3)} textAnchor="end" fontSize={9}>
              {formatCost(tick)}
            </text>
          </g>
        ))}
        {boundary !== null && bands[boundaryIndex] ? (
          <g className="report-boundary">
            <line
              x1={round(bands[boundaryIndex].start - 4)}
              y1={PLOT_TOP}
              x2={round(bands[boundaryIndex].start - 4)}
              y2={PLOT_BOTTOM}
              stroke="#8a5a2f"
              strokeDasharray="4 3"
            />
            <text x={round(bands[boundaryIndex].start - 2)} y={PLOT_TOP - 8} fontSize={9}>
              Planning records begin at change {boundary.folderKey}
            </text>
          </g>
        ) : null}
        {changes.map((change, index) => {
          const band = bands[index];
          if (!band) return null;
          return (
            <g key={change.folderKey}>
              {change.executionCost !== null ? (
                <CostMark
                  x={band.start}
                  width={barWidth}
                  value={change.executionCost}
                  coverage={change.executionCoverage}
                  kind="execution"
                  y={y}
                />
              ) : null}
              {change.planningCost !== null ? (
                <CostMark
                  x={band.start + slot}
                  width={barWidth}
                  value={change.planningCost}
                  coverage={change.planningCoverage}
                  kind="planning"
                  y={y}
                />
              ) : null}
              <text x={round(band.center)} y={PLOT_BOTTOM + 14} textAnchor="middle" fontSize={8}>
                {change.folderKey}
              </text>
            </g>
          );
        })}
        <g className="report-legend">
          <rect x={PLOT_LEFT} y={HEIGHT - 22} width={10} height={10} fill="#2f5d8a" />
          <text x={PLOT_LEFT + 14} y={HEIGHT - 13} fontSize={9}>
            Execution cost
          </text>
          <rect
            x={PLOT_LEFT + 120}
            y={HEIGHT - 22}
            width={10}
            height={10}
            fill="url(#cost-planning-hatch)"
          />
          <text x={PLOT_LEFT + 134} y={HEIGHT - 13} fontSize={9}>
            Planning cost
          </text>
        </g>
      </svg>
    </Figure>
  );
}
