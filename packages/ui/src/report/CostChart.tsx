import type { CSSProperties, ReactElement } from 'react';
import { DataTable, Figure } from './Figure.js';
import type { CostChange } from './cost.js';
import { compactCost, costWithCoverage, formatCost, formatLanded } from './format.js';
import { linearScale, round, shortenLabel } from './scales.js';

const WIDTH = 720;
const ROW_HEIGHT = 22;
const TOP = 24;
const BOTTOM = 44;
const LABEL_LEFT = 8;
const BAR_LEFT = 200;
const BAR_RIGHT = WIDTH - 190;
const BAR_HEIGHT = ROW_HEIGHT - 8;

const EXECUTION_FILL: CSSProperties = { fill: 'var(--accent)' };
const PLANNING_FILL: CSSProperties = { fill: 'url(#cost-planning-hatch)' };
const AXIS_STYLE: CSSProperties = { stroke: 'var(--border)' };
const RULE_STYLE: CSSProperties = { stroke: 'var(--status-regressed)' };
const TEXT_STYLE: CSSProperties = { fill: 'var(--text)' };
const MUTED_STYLE: CSSProperties = { fill: 'var(--muted)' };

export interface CostChartProps {
  /** Archived changes ascending by change number; drawn newest first. */
  readonly changes: readonly CostChange[];
  /** Folder key of the first change with a valid planning record, or null. */
  readonly boundaryKey: string | null;
}

interface CostSegment {
  readonly kind: 'execution' | 'planning';
  readonly from: number;
  readonly to: number;
  readonly coverage: { readonly reported: number; readonly total: number };
}

/** One horizontal row: shortened change name, stacked bars, and the row cost. */
function CostRow({
  change,
  top,
  x,
  planningAllowed,
}: {
  readonly change: CostChange;
  readonly top: number;
  readonly x: (value: number) => number;
  readonly planningAllowed: boolean;
}): ReactElement {
  const execution = change.executionCost;
  const planning = planningAllowed ? change.planningCost : null;
  const segments: CostSegment[] = [];
  let cursor = 0;
  if (execution !== null) {
    segments.push({
      kind: 'execution',
      from: 0,
      to: execution,
      coverage: change.executionCoverage,
    });
    cursor = execution;
  }
  if (planning !== null) {
    segments.push({
      kind: 'planning',
      from: cursor,
      to: cursor + planning,
      coverage: change.planningCoverage,
    });
    cursor += planning;
  }
  const labels: string[] = [];
  if (execution !== null) labels.push(compactCost(execution, change.executionCoverage));
  if (planning !== null) labels.push(compactCost(planning, change.planningCoverage));
  const endLabel =
    labels.length > 0 ? labels.join(' · ') : compactCost(null, change.executionCoverage);
  return (
    <g className="report-cost-row">
      <title>{change.folderKey}</title>
      <text x={LABEL_LEFT} y={top + BAR_HEIGHT - 1} fontSize={9} style={TEXT_STYLE}>
        {shortenLabel(change.folderKey)}
      </text>
      {segments.map((segment) => {
        const value = segment.to - segment.from;
        const width = Math.max(2, x(segment.to) - x(segment.from));
        return (
          <rect
            key={segment.kind}
            x={round(x(segment.from))}
            y={top}
            width={round(width)}
            height={BAR_HEIGHT}
            style={segment.kind === 'execution' ? EXECUTION_FILL : PLANNING_FILL}
          >
            <title>{`${segment.kind} cost ${compactCost(value, segment.coverage)}`}</title>
          </rect>
        );
      })}
      <text x={round(x(cursor) + 6)} y={top + BAR_HEIGHT - 1} fontSize={9} style={TEXT_STYLE}>
        {endLabel}
      </text>
    </g>
  );
}

/** Archived change cost per change, one horizontal row newest first. */
export function CostChart({ changes, boundaryKey }: CostChartProps): ReactElement {
  const rows = [...changes].reverse();
  const boundaryRow =
    boundaryKey === null ? -1 : rows.findIndex((row) => row.folderKey === boundaryKey);
  const totals = rows.map((row) => (row.executionCost ?? 0) + (row.planningCost ?? 0));
  const max = totals.length > 0 ? Math.max(...totals) : 0;
  const x = linearScale(0, max, BAR_LEFT, BAR_RIGHT);
  const height = TOP + Math.max(rows.length, 1) * ROW_HEIGHT + BOTTOM;
  const hasPlanning = boundaryRow >= 0;

  return (
    <Figure
      id="cost"
      title="Landed cost"
      question="How much reported execution and planning cost did each change accumulate?"
      summary={
        <>
          <DataTable
            caption="Reported execution and planning cost per archived change with exact coverage"
            columns={['Change', 'Landed', 'Execution cost', 'Planning cost']}
            rows={rows.map((change) => ({
              key: change.folderKey,
              cells: [
                change.folderKey,
                change.landed === null ? 'landed date not recorded' : formatLanded(change.landed),
                costWithCoverage(change.executionCost, change.executionCoverage, 'attempts'),
                costWithCoverage(change.planningCost, change.planningCoverage, 'sessions'),
              ],
            }))}
            emptyText="No archived change is available."
          />
          {boundaryKey === null ? (
            <p className="report-note">
              No change has a valid planning record; planning cost is unavailable.
            </p>
          ) : (
            <p className="report-note">
              Planning records begin at change {boundaryKey}; no planning mark is drawn before it.
            </p>
          )}
        </>
      }
    >
      <svg viewBox={`0 0 ${WIDTH} ${height}`} width="100%" role="img" aria-label="Cost per change">
        <title>Landed cost</title>
        <desc>
          Horizontal bars of reported execution and planning cost per change, newest first. Planning
          bars begin only at the first change with a valid planning record.
        </desc>
        <defs>
          <pattern id="cost-planning-hatch" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M0,6 L6,0" strokeWidth={1.5} style={RULE_STYLE} />
          </pattern>
        </defs>
        {rows.length === 0 ? (
          <text x={LABEL_LEFT} y={TOP + 16} fontSize={10} style={MUTED_STYLE}>
            No archived change carries a recorded cost.
          </text>
        ) : null}
        <line
          x1={LABEL_LEFT}
          y1={TOP - 4}
          x2={BAR_RIGHT}
          y2={TOP - 4}
          strokeWidth={1}
          style={AXIS_STYLE}
        />
        <text x={BAR_LEFT} y={TOP - 8} fontSize={9} style={MUTED_STYLE}>
          {formatCost(0)}
        </text>
        <text x={BAR_RIGHT} y={TOP - 8} textAnchor="end" fontSize={9} style={MUTED_STYLE}>
          {formatCost(max)}
        </text>
        {rows.map((change, index) => (
          <CostRow
            key={change.folderKey}
            change={change}
            top={TOP + index * ROW_HEIGHT}
            x={x}
            planningAllowed={hasPlanning && index <= boundaryRow}
          />
        ))}
        {hasPlanning ? (
          <g className="report-boundary">
            <line
              x1={LABEL_LEFT}
              y1={TOP + (boundaryRow + 1) * ROW_HEIGHT}
              x2={BAR_RIGHT}
              y2={TOP + (boundaryRow + 1) * ROW_HEIGHT}
              strokeWidth={1}
              strokeDasharray="4 3"
              style={RULE_STYLE}
            />
            <text
              x={LABEL_LEFT}
              y={TOP + (boundaryRow + 1) * ROW_HEIGHT - 3}
              fontSize={9}
              style={MUTED_STYLE}
            >
              Planning records begin at change {boundaryKey}
            </text>
          </g>
        ) : null}
        <g className="report-legend">
          <rect x={LABEL_LEFT} y={height - 18} width={10} height={10} style={EXECUTION_FILL} />
          <text x={LABEL_LEFT + 14} y={height - 9} fontSize={9} style={MUTED_STYLE}>
            Execution cost
          </text>
          <rect x={LABEL_LEFT + 120} y={height - 18} width={10} height={10} style={PLANNING_FILL} />
          <text x={LABEL_LEFT + 134} y={height - 9} fontSize={9} style={MUTED_STYLE}>
            Planning cost
          </text>
        </g>
      </svg>
    </Figure>
  );
}
