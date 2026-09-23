import fs from 'node:fs/promises';
import path from 'node:path';

// The retry transition's commit point: renaming active failure markers into
// attempt-suffixed history and appending the one lifecycle event that records
// it. Behavior is shared byte-identically by human and watcher callers.

export interface RetainFailureMarkersOptions {
  readonly runDir: string;
  readonly folderPath: string;
  readonly target: string;
  /** Shared next ordinal across retained dead and regressed failures. */
  readonly ordinal: number;
  readonly hasDead: boolean;
  readonly hasRegressed: boolean;
  /** Retire an active done marker alongside a retained regression. */
  readonly retainDone: boolean;
}

async function pathExists(target: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    () => false,
  );
}

/**
 * Rename active dead, regressed, and optionally done markers into their
 * attempt-suffixed history. Returns the retained paths relative to the change
 * folder in the established order: regressed, dead, then done.
 */
export async function retainFailureMarkers(
  options: RetainFailureMarkersOptions,
): Promise<string[]> {
  const { runDir, folderPath, target, ordinal, hasDead, hasRegressed, retainDone } = options;
  const deadDir = path.join(runDir, 'dead');
  const regressedDir = path.join(runDir, 'regressed');
  const retained: string[] = [];
  const retain = async (from: string, to: string): Promise<void> => {
    await fs.rename(from, to);
    retained.push(path.relative(folderPath, to));
  };
  if (hasRegressed) {
    await retain(
      path.join(regressedDir, `${target}.md`),
      path.join(regressedDir, `${target}.${ordinal}.md`),
    );
  }
  if (hasDead) {
    await retain(path.join(deadDir, `${target}.md`), path.join(deadDir, `${target}.${ordinal}.md`));
  }
  if (retainDone) {
    const donePath = path.join(runDir, 'done', target);
    if (await pathExists(donePath)) {
      await retain(donePath, path.join(runDir, 'done', `${target}.${ordinal}`));
    }
  }
  return retained;
}

/** Append one timestamped target-scoped lifecycle event. */
export async function appendTargetEvent(
  folderPath: string,
  target: string,
  event: { type: string; data: unknown },
): Promise<void> {
  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const line = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
  await fs.appendFile(path.join(eventsDir, `${target}.jsonl`), `${line}\n`, 'utf8');
}
