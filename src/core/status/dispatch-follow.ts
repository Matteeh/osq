import type { OsqConfig } from '../foundation/config.js';
import type { OrderedDispatchItem } from './dispatch-order.js';
import { formatDispatchItemSummary, formatDispatchText } from './dispatch-text.js';
import { type DispatchWatch, type WatchDispatchOptions, watchDispatch } from './dispatch-watch.js';
import { readDispatch } from './dispatch.js';
import type { InboxSound } from './inbox-sound.js';

export type { EveryFn } from './dispatch-watch.js';

/** Injectable seams so tests drive the follow loop without real resources. */
export interface FollowDispatchOptions extends WatchDispatchOptions {
  readonly stdout?: (message: string) => void;
  readonly sound?: InboxSound;
  readonly signal?: AbortSignal;
}

/** Kind, change folder, and task number as one identity. */
function identityOf(item: OrderedDispatchItem): string {
  return `${item.kind}\u0000${item.change.folder}\u0000${item.task?.number ?? ''}`;
}

/** Print `+` lines for new items and `-` lines for departed ones, in order. */
function followDelta(
  previous: readonly OrderedDispatchItem[],
  items: readonly OrderedDispatchItem[],
  at: Date,
  out: (message: string) => void,
): boolean {
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const before = new Set(previous.map(identityOf));
  const after = new Set(items.map(identityOf));
  let appeared = 0;
  for (const item of items) {
    if (before.has(identityOf(item))) continue;
    out(`${time} + ${formatDispatchItemSummary(item)}\n`);
    appeared += 1;
  }
  for (const item of previous) {
    if (after.has(identityOf(item))) continue;
    out(`${time} - ${formatDispatchItemSummary(item)}\n`);
  }
  return appeared > 0;
}

/** Close the watch once `signal` aborts; without one, wait forever. */
async function closeOnAbort(watch: DispatchWatch, signal: AbortSignal | undefined): Promise<void> {
  if (signal === undefined) {
    await new Promise<void>(() => undefined);
    return;
  }
  if (!signal.aborted) {
    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
  }
  await watch.close();
}

/**
 * Print the current dispatch text, then follow the watch: each derivation adds
 * `+` lines for new items, `-` lines for departed ones, and sounds once per new
 * batch. Resolves when `options.signal` aborts; otherwise it follows forever.
 */
export async function followDispatch(
  projectRoot: string,
  config: OsqConfig,
  options: FollowDispatchOptions = {},
): Promise<void> {
  const out = options.stdout ?? ((message: string) => process.stdout.write(message));
  const sound = options.sound ?? { notify: () => undefined };
  const preview = await readDispatch(projectRoot, config);
  out(`${formatDispatchText(preview)}\n`);
  out('Waiting for new items (Ctrl-C to stop).\n');
  let previous: readonly OrderedDispatchItem[] = preview.items;
  const watch = watchDispatch(projectRoot, config, options, (items, at) => {
    const appeared = followDelta(previous, items, at, out);
    previous = items;
    if (appeared) sound.notify(at);
  });
  await closeOnAbort(watch, options.signal);
}
