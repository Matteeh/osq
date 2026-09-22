import type { ReactElement } from 'react';
import type { SizeBucketRow } from '../../../../src/core/report.js';
import type { MetricsReport } from '../contracts.js';
import { DataTable } from './Figure.js';
import { formatCount, formatDurationSeconds, formatPercent } from './format.js';

function seriesLabel(resolver: 'legacy' | 'resolver-2'): string {
  return resolver === 'legacy' ? 'Legacy' : 'Resolver-2';
}

function bucketRows(rows: readonly SizeBucketRow[]): {
  key: string;
  cells: readonly (string | number)[];
}[] {
  return rows.map((row) => ({
    key: row.bucket,
    cells: [
      row.bucket,
      formatCount(row.tasks),
      formatPercent(row.firstAttemptPassRate),
      String(row.meanAttempts),
      formatDurationSeconds(row.medianDurationSeconds),
    ],
  }));
}

const BUCKET_COLUMNS = [
  'Bucket',
  'Tasks',
  'First-attempt pass rate',
  'Mean attempts',
  'Median duration',
];

/** Scope-file series, combined acceptance lines, and scope-regression counters. */
export function ScopePanel({ report }: { readonly report: MetricsReport }): ReactElement {
  const sizes = report.history.sizes;
  const regressions = report.history.scopeRegressions;
  const counters: readonly { readonly label: string; readonly value: number }[] = [
    { label: 'Detected', value: regressions.detected },
    { label: 'Verification passed at detection', value: regressions.verificationPassedAtDetection },
    { label: 'Verification failed at detection', value: regressions.verificationFailedAtDetection },
    { label: 'Recertified by human', value: regressions.recertifiedByHuman },
    { label: 'Requeued for agent', value: regressions.requeuedForAgent },
  ];

  return (
    <section className="report-scope" aria-labelledby="report-scope-title">
      <h3 id="report-scope-title">Scope evidence</h3>
      <p className="report-note">
        Legacy and resolver-2 scope sizes are rendered as separate series and are never compared or
        merged.
      </p>
      {sizes.scopeFileSeries.map((series) => (
        <section key={series.resolver} className="report-scope-series">
          <h4>{seriesLabel(series.resolver)} scope-file evidence</h4>
          <p className="report-note">
            {series.resolver === 'resolver-2'
              ? series.startsAtChange === null
                ? 'No resolver-2 boundary is recorded.'
                : `begins at change ${series.startsAtChange}`
              : 'Legacy generation has no recorded boundary.'}
          </p>
          <DataTable
            caption={`${seriesLabel(series.resolver)} scope-file buckets`}
            columns={BUCKET_COLUMNS}
            rows={bucketRows(series.byScopeFiles)}
            emptyText="No measured task is available."
          />
          <p className="report-note">
            {series.largestFirstAttemptPass === null
              ? 'Largest first-attempt pass: unavailable'
              : `Largest first-attempt pass: ${series.largestFirstAttemptPass.change}/${series.largestFirstAttemptPass.task} "${series.largestFirstAttemptPass.title}" (scope files: ${formatCount(series.largestFirstAttemptPass.scopeFiles)}, acceptance lines: ${formatCount(series.largestFirstAttemptPass.acceptanceLines)})`}
          </p>
        </section>
      ))}
      <section className="report-scope-series">
        <h4>Combined acceptance-line evidence</h4>
        <DataTable
          caption="Acceptance-line buckets across both resolver generations"
          columns={BUCKET_COLUMNS}
          rows={bucketRows(sizes.byAcceptanceLines)}
          emptyText="No measured acceptance-line evidence is available."
        />
      </section>
      <section className="report-scope-series">
        <h4>Scope-regression counters</h4>
        <DataTable
          caption="Scope-regression detection and recertification counters"
          columns={['Counter', 'Count']}
          rows={counters.map((counter) => ({
            key: counter.label,
            cells: [counter.label, formatCount(counter.value)],
          }))}
        />
      </section>
    </section>
  );
}
