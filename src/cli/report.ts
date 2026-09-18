import { type OsqConfig, loadConfig } from '../core/config.js';
import { type MetricsReport, formatMetricsReport, getMetricsReport } from '../core/report.js';

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
  const stable: Record<string, unknown> = {
    completionRate: report.completionRate,
    durations: {
      totalMs: report.durations.totalMs,
      totalSeconds: report.durations.totalSeconds,
      avgMs: report.durations.avgMs,
      avgSeconds: report.durations.avgSeconds,
      formattedTotal: report.durations.formattedTotal,
      formattedAvg: report.durations.formattedAvg,
    },
    failureBreakdown: { ...report.failureBreakdown },
    fileChanges: {
      totalChanges: report.fileChanges.totalChanges,
      uniqueCount: report.fileChanges.uniqueCount,
      uniqueFiles: [...report.fileChanges.uniqueFiles],
    },
    specs: { ...report.specs },
    tasks: { ...report.tasks },
    tokens: {
      input: report.tokens.input,
      cached_input: report.tokens.cached_input,
      output: report.tokens.output,
      reasoning: report.tokens.reasoning,
      total: report.tokens.total,
      cacheSharePercent: report.tokens.cacheSharePercent,
    },
  };

  if (report.cost) {
    stable.cost = {
      total: report.cost.total,
      perSpec: { ...report.cost.perSpec },
      formattedTotal: report.cost.formattedTotal,
    };
  }

  return stable;
}

export async function reportCommand(options: ReportCommandOptions = {}): Promise<string> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));

  try {
    const report = await getMetricsReport(cwd, config);
    const output = options.json
      ? serializeSortedJson(toStableMetrics(report))
      : formatMetricsReport(report);

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
