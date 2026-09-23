import type { CSSProperties, ReactElement } from 'react';
import { DataTable, Figure } from './Figure.js';
import { formatCount, formatPercent, modelLabel } from './format.js';
import type { TokenTotal } from './landed.js';
import { linearScale, round } from './scales.js';

const ACCENT_FILL: CSSProperties = { fill: 'var(--accent)' };
const MUTED_STYLE: CSSProperties = { fill: 'var(--muted)' };
const TEXT_STYLE: CSSProperties = { fill: 'var(--text)' };

const WIDTH = 720;
const ROW_HEIGHT = 44;
const TOP = 24;
const BAR_LEFT = 200;
const BAR_RIGHT = WIDTH - 24;

export interface TokenChartProps {
  readonly groups: readonly TokenTotal[];
}

/** Recorded token totals grouped by harness and model with cache share. */
export function TokenChart({ groups }: TokenChartProps): ReactElement {
  const max = groups.reduce((current, group) => Math.max(current, group.total), 0);
  const x = linearScale(0, max, BAR_LEFT, BAR_RIGHT);
  const height = TOP + Math.max(groups.length, 1) * ROW_HEIGHT + 16;

  return (
    <Figure
      id="tokens"
      title="Token provenance"
      question="Which recorded harness and model produced token totals, and what cache share did they carry?"
      summary={
        <DataTable
          caption="Recorded token totals by harness and model, with cached input retained"
          columns={[
            'Harness',
            'Model',
            'Input',
            'Cached input',
            'Cache share',
            'Output',
            'Reasoning',
            'Total',
          ]}
          rows={groups.map((group) => ({
            key: `${group.harness}\u0000${group.model ?? ''}`,
            cells: [
              group.harness,
              modelLabel(group.model),
              formatCount(group.input),
              formatCount(group.cachedInput),
              formatPercent(group.cacheShare),
              formatCount(group.output),
              formatCount(group.reasoning),
              formatCount(group.total),
            ],
          }))}
          emptyText="No recorded token total is available."
        />
      }
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        width="100%"
        role="img"
        aria-label="Tokens by harness and model"
      >
        <title>Token provenance</title>
        <desc>
          Horizontal bars of recorded token totals grouped by harness and nullable model. Unlike and
          unavailable provenance is never merged.
        </desc>
        {groups.length === 0 ? (
          <text x={8} y={TOP + 16} fontSize={10} style={MUTED_STYLE}>
            Token provenance is unavailable: no recorded token totals.
          </text>
        ) : null}
        {groups.map((group, index) => {
          const rowTop = TOP + index * ROW_HEIGHT;
          const barWidth = Math.max(0, x(group.total) - BAR_LEFT);
          return (
            <g key={`${group.harness}\u0000${group.model ?? ''}`}>
              <text x={8} y={rowTop + 15} fontSize={10} style={TEXT_STYLE}>
                {group.harness} / {modelLabel(group.model)}
              </text>
              <rect
                x={BAR_LEFT}
                y={rowTop + 2}
                width={round(barWidth)}
                height={20}
                style={ACCENT_FILL}
              >
                <title>{`${group.harness} ${modelLabel(group.model)} total ${formatCount(group.total)} tokens`}</title>
              </rect>
              <text
                x={round(BAR_LEFT + barWidth + 6)}
                y={rowTop + 16}
                fontSize={9}
                style={MUTED_STYLE}
              >
                {formatCount(group.total)} total · cache share {formatPercent(group.cacheShare)}
              </text>
            </g>
          );
        })}
      </svg>
    </Figure>
  );
}
