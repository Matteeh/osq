import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC_DIR = path.join(ROOT, 'src');
const MAX_LINES = 80;

/**
 * Explicit grandfather list of oversized legacy functions.
 *
 * Every key predates this ratchet and cannot be split from within this task's
 * scope; they are grandfathered so the suite passes while still preventing any
 * *new* function from exceeding the budget. Remove a key once its function is
 * split, so the list can only shrink; changes 048 through 053 are planned for
 * that work.
 */
const GRANDFATHERED = new Set([
  'core/report/report.ts#getMetricsReport',
  'core/status/show.ts#buildSpecDetails',
  'core/report/report.ts#formatMetricsReport',
  'cli/index.ts#createProgram',
  'core/lifecycle/retry.ts#retrySpec',
  'core/spec/linter.ts#lintChangeFolder',
  'watcher/loop.ts#runWatcherCycle',
  'watcher/runner.ts#runTask',
  'core/status/show.ts#formatSpecDetails',
  'cli/plan.ts#planCommand',
  'cli/report.ts#toStableMetrics',
  'harness/opencode/opencode.ts#buildOpencodeArgs',
  'harness/process.ts#spawnWithTimeout',
  'core/web/web-server.ts#startWebServer',
  'watcher/regression.ts#auditScopeRegressions',
  'watcher/loop.ts#startWatcher',
  'watcher/spawn.ts#spawnTaskAgent',
  'core/foundation/logger.ts#createLogger',
  'core/foundation/new.ts#createNewSpec',
  'watcher/dev.ts#runDevSupervisor',
  'harness/agy/agy.ts#processAgyStdoutLine',
]);

/** Recursively collect every non-declaration TypeScript file under `dir`. */
async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

/** The key and measured length of one function-like node. */
interface FunctionMeasurement {
  readonly key: string;
  readonly lines: number;
}

/** Length in inclusive lines from a node's first token to its last. */
function measure(sf: ts.SourceFile, start: number, end: number): number {
  const first = sf.getLineAndCharacterOfPosition(start).line;
  const last = sf.getLineAndCharacterOfPosition(end).line;
  return last - first + 1;
}

/**
 * Measure every function declaration, method declaration, and const-bound
 * arrow or function expression in `source`, keyed `<relative>#<name>`.
 */
function measureFunctions(relative: string, source: string): FunctionMeasurement[] {
  const sf = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true);
  const measurements: FunctionMeasurement[] = [];

  const record = (name: string, start: number, end: number): void => {
    measurements.push({ key: `${relative}#${name}`, lines: measure(sf, start, end) });
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isVariableDeclarationList(node.parent) &&
      (ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const) !== 0
    ) {
      const initializer = node.initializer;
      if (
        initializer !== undefined &&
        (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
        ts.isIdentifier(node.name)
      ) {
        record(node.name.getText(sf), initializer.getStart(sf), initializer.getEnd());
      }
    } else if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      record(node.name.getText(sf), node.getStart(sf), node.getEnd());
    } else if (ts.isMethodDeclaration(node) && node.name !== undefined) {
      record(node.name.getText(sf), node.getStart(sf), node.getEnd());
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return measurements;
}

/** Every measurement over budget for one file, keyed by relative path. */
async function measureFile(file: string): Promise<FunctionMeasurement[]> {
  const relative = path.relative(SRC_DIR, file).split(path.sep).join('/');
  const source = await fs.readFile(file, 'utf8');
  return measureFunctions(relative, source);
}

describe('source function budget', () => {
  it('keeps every non-grandfathered function at or under 80 lines', async () => {
    const files = await listSourceFiles(SRC_DIR);
    const violations: string[] = [];

    for (const file of files) {
      for (const measurement of await measureFile(file)) {
        if (GRANDFATHERED.has(measurement.key)) continue;
        if (measurement.lines > MAX_LINES) {
          violations.push(`${measurement.key} has ${measurement.lines} lines (max ${MAX_LINES})`);
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Functions exceed the ${MAX_LINES}-line budget:\n${violations.join('\n')}`,
    );
  });

  it('removes every grandfather key that no longer names an over-budget function', async () => {
    const files = await listSourceFiles(SRC_DIR);
    const overBudget = new Set<string>();

    for (const file of files) {
      for (const measurement of await measureFile(file)) {
        if (measurement.lines > MAX_LINES) overBudget.add(measurement.key);
      }
    }

    const stale = [...GRANDFATHERED].filter((key) => !overBudget.has(key)).sort();

    assert.deepEqual(stale, [], `Grandfather entries no longer over budget:\n${stale.join('\n')}`);
  });
});
