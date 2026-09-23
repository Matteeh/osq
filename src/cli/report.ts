import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import {
  type MetricsReport,
  formatMetricsReport,
  getMetricsReport,
} from '../core/report/report.js';

export interface ReportCommandOptions {
  cwd?: string;
  stdout?: (msg: string) => void;
  config?: OsqConfig;
  json?: boolean;
}

/** Recursively sorts object keys so serialized output is deterministic on every platform. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeysDeep(record[key]);
    }
    return sorted;
  }
  return value;
}

export function serializeSortedJson(data: unknown): string {
  return JSON.stringify(sortKeysDeep(data), null, 2);
}

/**
 * Projects the report down to the stable {@link MetricsReport} shape, dropping
 * backward-compatibility aliases so the machine-readable output stays fixed.
 */
function toStableMetrics(report: MetricsReport): Record<string, unknown> {
  return {
    approvalFlags: {
      changes: report.approvalFlags.changes,
      byFlag: Object.fromEntries(
        Object.entries(report.approvalFlags.byFlag).map(([key, outcome]) => [
          key,
          {
            shown: { ...outcome.shown },
            confirmed: { ...outcome.confirmed },
          },
        ]),
      ),
    },
    completionRate: report.completionRate,
    coverage: {
      withEvents: report.coverage.withEvents,
      withoutEvents: report.coverage.withoutEvents,
      byChange: Object.fromEntries(
        Object.entries(report.coverage.byChange).map(([change, entry]) => [
          change,
          {
            withEvents: [...entry.withEvents],
            withoutEvents: [...entry.withoutEvents],
          },
        ]),
      ),
    },
    cycle: {
      phases: {
        briefToApproval: { ...report.cycle.phases.briefToApproval },
        approvalToFirstTask: { ...report.cycle.phases.approvalToFirstTask },
        firstTaskToArchive: { ...report.cycle.phases.firstTaskToArchive },
        total: { ...report.cycle.phases.total },
      },
      byChange: report.cycle.byChange.map((row) => ({ ...row })),
    },
    durations: {
      totalMs: report.durations.totalMs,
      totalSeconds: report.durations.totalSeconds,
      avgMs: report.durations.avgMs,
      avgSeconds: report.durations.avgSeconds,
      formattedTotal: report.durations.formattedTotal,
      formattedAvg: report.durations.formattedAvg,
    },
    fileChanges: {
      totalChanges: report.fileChanges.totalChanges,
      uniqueCount: report.fileChanges.uniqueCount,
      uniqueFiles: [...report.fileChanges.uniqueFiles],
    },
    history: {
      attempts: {
        total: report.history.attempts.total,
        byTask: { ...report.history.attempts.byTask },
        multipleAttempts: [...report.history.attempts.multipleAttempts],
      },
      deadByReason: { ...report.history.deadByReason },
      unexplainedReruns: {
        total: report.history.unexplainedReruns.total,
        byTask: { ...report.history.unexplainedReruns.byTask },
      },
      verifyRuns: {
        total: report.history.verifyRuns.total,
        missingExitCode: report.history.verifyRuns.missingExitCode,
        byTask: Object.fromEntries(
          Object.entries(report.history.verifyRuns.byTask).map(([task, codes]) => [
            task,
            [...codes],
          ]),
        ),
      },
      preSpawnVerify: {
        runs: report.history.preSpawnVerify.runs,
        mismatches: report.history.preSpawnVerify.mismatches,
        mismatchedTasks: [...report.history.preSpawnVerify.mismatchedTasks],
        missingPathRuns: report.history.preSpawnVerify.missingPathRuns,
        byStart: {
          red: { ...report.history.preSpawnVerify.byStart.red },
          green: { ...report.history.preSpawnVerify.byStart.green },
          any: { ...report.history.preSpawnVerify.byStart.any },
        },
      },
      cost: {
        total: report.history.cost.total,
        perSpec: { ...report.history.cost.perSpec },
        formattedTotal: report.history.cost.formattedTotal,
        provenance: report.history.cost.provenance,
        coverage: { ...report.history.cost.coverage },
      },
      retries: {
        automatic: { ...report.history.retries.automatic },
        manual: { ...report.history.retries.manual },
        stuck: report.history.retries.stuck,
      },
      rejections: {
        total: report.history.rejections.total,
        byPlannerModel: { ...report.history.rejections.byPlannerModel },
      },
      sizes: {
        byAcceptanceLines: report.history.sizes.byAcceptanceLines.map((row) => ({ ...row })),
        scopeFileSeries: report.history.sizes.scopeFileSeries.map((series) => ({
          resolver: series.resolver,
          startsAtChange: series.startsAtChange,
          byScopeFiles: series.byScopeFiles.map((row) => ({ ...row })),
          largestFirstAttemptPass: series.largestFirstAttemptPass
            ? { ...series.largestFirstAttemptPass }
            : null,
        })),
      },
      scopeRegressions: { ...report.history.scopeRegressions },
    },
    now: { ...report.now },
    planning: {
      sessions: report.planning.sessions,
      changesWithPlanningRecords: report.planning.changesWithPlanningRecords,
      wallSeconds: report.planning.wallSeconds,
      wallSecondsByChange: { ...report.planning.wallSecondsByChange },
      tokens: { ...report.planning.tokens },
      cost: { ...report.planning.cost },
      coverage: { ...report.planning.coverage },
      byChange: Object.fromEntries(
        Object.entries(report.planning.byChange).map(([change, entry]) => [
          change,
          { ...entry, tokens: { ...entry.tokens } },
        ]),
      ),
      comparison: {
        planning: { ...report.planning.comparison.planning },
        execution: { ...report.planning.comparison.execution },
      },
    },
    queue: {
      configured: report.queue.configured,
      failures: report.queue.failures.map((failure) => ({
        change: failure.change,
        reason: failure.reason,
        target: failure.target,
      })),
      items: report.queue.items.map((item) => ({
        change: item.change,
        changedSincePlanned: item.changedSincePlanned,
        plannedToLandedSeconds: item.plannedToLandedSeconds,
        rejectionCount: item.rejectionCount,
        slug: item.slug,
        state: item.state,
        title: item.title,
      })),
      landed: report.queue.landed,
      planning: {
        cost: report.queue.planning.cost,
        costCoverageComplete: report.queue.planning.costCoverageComplete,
        sessions: report.queue.planning.sessions,
      },
      rejections: report.queue.rejections.map((rejection) => ({
        change: rejection.change,
        reason: rejection.reason,
        slug: rejection.slug,
        timestamp: rejection.timestamp,
      })),
      total: report.queue.total,
    },
    specs: { ...report.specs },
    tokens: {
      input: report.tokens.input,
      cached_input: report.tokens.cached_input,
      output: report.tokens.output,
      reasoning: report.tokens.reasoning,
      total: report.tokens.total,
      cacheSharePercent: report.tokens.cacheSharePercent,
    },
  };
}

export async function reportCommand(options: ReportCommandOptions = {}): Promise<string> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));

  try {
    const report = await getMetricsReport(cwd, config);
    const output = options.json
      ? serializeSortedJson(toStableMetrics(report))
      : formatMetricsReport(report, config);

    if (options.stdout) {
      options.stdout(output);
    } else {
      console.log(output);
    }
    return output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Report error: ${message}`);
    process.exit(1);
  }
}
