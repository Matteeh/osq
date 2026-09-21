import fs from 'node:fs/promises';
import { DEFAULT_CONFIG, type OsqConfig } from './config.js';
import {
  type QueueReport,
  emptyQueueReport,
  readQueueReportFailure,
  readQueueReportItem,
  readQueueReportRejections,
} from './queue-report-detail.js';
import {
  findActiveQueueFailures,
  getQueuePath,
  projectQueue,
  readQueuePlanningUsage,
  scanQueueAssociations,
} from './queue.js';

export type {
  QueueReport,
  QueueReportFailure,
  QueueReportItem,
  QueueReportPlanning,
  QueueReportRejection,
} from './queue-report-detail.js';

async function fileExists(filePath: string): Promise<boolean> {
  return fs.stat(filePath).then(
    () => true,
    () => false,
  );
}

/**
 * Read the stable queue view for the delivery report.
 *
 * A missing queue file yields the deterministic unconfigured empty view so
 * ordinary repositories never depend on a queue. Once the file exists, queue
 * parse errors and ambiguous associations propagate unchanged. The projection
 * reuses the established queue facade for state, failures, and spend, and adds
 * report-only rejection and elapsed-time derivation.
 */
export async function readQueueReport(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<QueueReport> {
  if (!(await fileExists(getQueuePath(projectRoot, config)))) return emptyQueueReport();

  const projection = await projectQueue(projectRoot, config);
  const associations = await scanQueueAssociations(projectRoot, config, null);
  const usage = await readQueuePlanningUsage(projectRoot, config);
  const failures = await findActiveQueueFailures(projectRoot, config);

  const items = await Promise.all(
    projection.items.map((row) => readQueueReportItem(row, associations.get(row.slug))),
  );
  const failureRows = await Promise.all(
    failures.map((failure) => readQueueReportFailure(projectRoot, config, failure)),
  );
  const rejections = await readQueueReportRejections(associations);

  return {
    configured: true,
    landed: projection.landedCount,
    total: projection.totalCount,
    planning: {
      sessions: usage.sessions,
      cost: usage.cost,
      costCoverageComplete: usage.costCoverageComplete,
    },
    items,
    failures: failureRows,
    rejections,
  };
}
