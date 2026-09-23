import type { ReactElement } from 'react';
import type { MetricsReport, WebGraph } from '../contracts.js';
import { CostChart } from './CostChart.js';
import { DurationChart } from './DurationChart.js';
import { PassChart } from './PassChart.js';
import { RepositoryTotals } from './RepositoryTotals.js';
import { ScopePanel } from './ScopePanel.js';
import { TokenChart } from './TokenChart.js';
import { WritesChart } from './WritesChart.js';
import { costChanges } from './cost.js';
import {
  aggregateTokens,
  capabilityWriteSeries,
  durationHistogram,
  landedChanges,
  passWindows,
  planningBoundaryIndex,
} from './landed.js';

export interface ReportViewProps {
  readonly report: MetricsReport;
  readonly graph: WebGraph;
}

/**
 * The report route: five purpose-labelled inline SVG figures over landed and
 * observed graph data, plus unchanged report scope, regression, and coverage
 * evidence. All inputs are treated as immutable.
 */
export function ReportView({ report, graph }: ReportViewProps): ReactElement {
  const changes = landedChanges(graph);
  const cost = costChanges(graph);
  const boundaryIndex = planningBoundaryIndex(cost);
  const boundaryKey = boundaryIndex >= 0 ? cost[boundaryIndex].folderKey : null;
  const tokens = aggregateTokens(graph);
  const windows = passWindows(changes);
  const bins = durationHistogram(graph);
  const writes = capabilityWriteSeries(graph, changes);

  return (
    <section className="view report-view" aria-labelledby="report-view-title">
      <h2 id="report-view-title">Delivery report</h2>
      <RepositoryTotals report={report} />
      <div className="report-figures">
        <CostChart changes={cost} boundaryKey={boundaryKey} />
        <TokenChart groups={tokens} />
        <PassChart windows={windows} />
        <DurationChart bins={bins} />
        <WritesChart series={writes} changes={changes} />
      </div>
      <ScopePanel report={report} />
    </section>
  );
}
