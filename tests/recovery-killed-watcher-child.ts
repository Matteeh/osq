import fs from 'node:fs/promises';
import path from 'node:path';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { recoveryConfig } from './recovery-support.js';

/**
 * A script, not a test. It starts one watcher over the temporary repository the
 * parent test built, with an adapter whose spawn writes half of the task's file,
 * signals the parent through the ready file, and then never resolves, so the
 * parent can SIGKILL a watcher that is genuinely mid-task.
 */

const [repo, worktreeRoot, readyPath] = process.argv.slice(2);
if (repo === undefined || worktreeRoot === undefined || readyPath === undefined) {
  throw new Error('usage: recovery-killed-watcher-child <repo> <worktree-root> <ready-file>');
}

class HalfAdapter implements HarnessAdapter {
  readonly name = 'half';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const target = options.scope[0];
    if (target !== undefined) {
      const file = path.join(options.projectRoot, target);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, 'half\n', 'utf8');
    }
    await fs.writeFile(readyPath, 'ready\n', 'utf8');
    return new Promise<SpawnResult>(() => {});
  }
}

// A real spawned agent keeps the event loop alive; the never-resolving adapter
// promise alone does not, so hold one ref'd timer until the parent SIGKILLs us.
setInterval(() => {}, 1000);

await runWatcherOnce(repo, recoveryConfig(worktreeRoot, 1), new HalfAdapter());
