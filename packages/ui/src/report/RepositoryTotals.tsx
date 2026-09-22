import type { ReactElement } from 'react';
import type { MetricsReport } from '../contracts.js';
import { DataTable } from './Figure.js';
import { formatCount } from './format.js';

function percent(value: number): string {
  return Number.isFinite(value) ? `${value}%` : 'unavailable';
}

/** Repository-wide totals and overall coverage derived from `MetricsReport`. */
export function RepositoryTotals({ report }: { readonly report: MetricsReport }): ReactElement {
  const { now, coverage, durations, history, planning, specs, tokens } = report;
  const rows = [
    {
      key: 'specs',
      cells: [
        'Specifications',
        `${formatCount(specs.active)} active · ${formatCount(specs.archived)} archived · ${formatCount(specs.total)} total`,
      ],
    },
    {
      key: 'tasks',
      cells: [
        'Tasks',
        `${formatCount(now.done)} of ${formatCount(now.total)} done (${percent(report.completionRate)})`,
      ],
    },
    {
      key: 'states',
      cells: [
        'Task states',
        `verified ${formatCount(now.verified)} · manual ${formatCount(now.manual)} · dead ${formatCount(now.dead)} · regressed ${formatCount(now.regressed)} · running ${formatCount(now.running)} · pending ${formatCount(now.pending)}`,
      ],
    },
    {
      key: 'event-coverage',
      cells: [
        'Event-file coverage',
        `${formatCount(coverage.withEvents)} with events · ${formatCount(coverage.withoutEvents)} without events`,
      ],
    },
    {
      key: 'duration',
      cells: ['Task time', `${durations.formattedTotal} total · ${durations.formattedAvg} average`],
    },
    {
      key: 'cost',
      cells: [
        'Harness-reported cost',
        `${history.cost.formattedTotal} (${formatCount(history.cost.coverage.reportedAttempts)} of ${formatCount(history.cost.coverage.totalAttempts)} attempts reported)`,
      ],
    },
    {
      key: 'tokens',
      cells: [
        'Tokens',
        `${formatCount(tokens.total)} total · cache share ${percent(tokens.cacheSharePercent)}`,
      ],
    },
    {
      key: 'planning',
      cells: [
        'Planning',
        `${formatCount(planning.sessions)} sessions · ${formatCount(planning.changesWithPlanningRecords)} changes · ${planning.cost.formattedTotal} (${formatCount(planning.coverage.reportedSessions)} of ${formatCount(planning.coverage.totalSessions)} sessions reported)`,
      ],
    },
  ];

  return (
    <section className="report-totals" aria-labelledby="report-totals-title">
      <h3 id="report-totals-title">Repository totals</h3>
      <DataTable
        caption="Repository totals and overall coverage"
        columns={['Metric', 'Value']}
        rows={rows}
      />
    </section>
  );
}
