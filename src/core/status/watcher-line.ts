import type { WatchState, WatcherRecord } from '../run/watch-state.js';

/**
 * Render the watch state `readWatchState` returns as one line: whether a
 * watcher runs, where, and on which build, with `, waiting: <reason>` when the
 * live `watcher.json` names a reason the watcher starts no task.
 */
export function formatWatcherLine(state: WatchState): string {
  if (state.service) {
    const head = state.watcher
      ? `Watcher: running in the background, osq v${state.watcher.version} (${state.watcher.commit}), pid ${state.service.pid}`
      : `Watcher: restarting in the background, pid ${state.service.pid}`;
    return withWaiting(head, state.watcher);
  }
  if (state.watcher) {
    const head = `Watcher: running in a terminal, osq v${state.watcher.version} (${state.watcher.commit}), pid ${state.watcher.pid}`;
    return withWaiting(head, state.watcher);
  }
  return 'Watcher: not running — osq watch --background';
}

function withWaiting(line: string, watcher: WatcherRecord | null): string {
  return watcher?.waiting ? `${line}, waiting: ${watcher.waiting}` : line;
}
