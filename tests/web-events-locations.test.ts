import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  type InvalidationBatch,
  type ScheduleFn,
  type WatchEvent,
  type WatcherLike,
  createInvalidationHub,
} from '../src/core/web/web-events.js';

/** Minimal deterministic watcher seam: listeners registered and events replayed. */
class FakeWatcher implements WatcherLike {
  closed = false;
  private readonly listeners = new Map<WatchEvent, Array<(target: string) => void>>();

  on(event: WatchEvent, listener: (target: string) => void): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }

  emit(event: WatchEvent, target: string): void {
    for (const listener of this.listeners.get(event) ?? []) listener(target);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

/** Manual debounce seam: capture the one pending callback and fire it on demand. */
class ManualScheduler {
  private callback: (() => void) | null = null;

  readonly schedule: ScheduleFn = (callback) => {
    this.callback = callback;
    return {
      cancel: () => {
        this.callback = null;
      },
    };
  };

  fire(): void {
    const callback = this.callback;
    this.callback = null;
    callback?.();
  }
}

describe('invalidation hub change trees', () => {
  it('classifies paths through the change tree it is given', () => {
    const watcher = new FakeWatcher();
    const scheduler = new ManualScheduler();
    const root = path.resolve('/tmp/osq-tree-root');
    const tree = {
      root,
      changesDir: path.join(root, 'openspec', 'changes'),
      archiveDir: path.join(root, 'openspec', 'changes', 'archive'),
      rejectedDir: path.join(root, 'openspec', 'changes', 'rejected'),
    };
    const hub = createInvalidationHub({
      projectRoot: root,
      openspecRoot: 'openspec',
      debounceMs: 25,
      trees: [tree],
      watch: () => watcher,
      schedule: scheduler.schedule,
    });
    const batches: InvalidationBatch[] = [];
    hub.subscribe((batch) => batches.push(batch));

    watcher.emit('change', path.join(tree.changesDir, '010-active', 'brief.md'));
    watcher.emit('change', path.join(tree.archiveDir, '003-archived', 'tasks', '1.md'));
    watcher.emit('change', path.join(tree.rejectedDir, '002-rejected', 'proposal.md'));
    scheduler.fire();
    assert.deepEqual(batches, [{ ids: [2, 3, 10] }]);

    watcher.emit('change', path.join(tree.changesDir, 'notes.md'));
    scheduler.fire();
    assert.deepEqual(batches, [{ ids: [2, 3, 10] }, { ids: [] }]);
  });
});
