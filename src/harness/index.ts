import {
  type HarnessName,
  availableHarnessNames,
  lookupHarness,
} from '../core/foundation/harness-catalog.js';
import { AgyAdapter } from './agy/agy.js';
import { CodexAdapter } from './codex/codex.js';
import { MockAdapter } from './mock.js';
import { OpencodeAdapter } from './opencode/opencode.js';
import { PiAdapter } from './pi/pi.js';
import type { HarnessAdapter } from './types.js';

/**
 * Runtime adapter factories. The `Record<HarnessName, ...>` type keeps this map
 * statically exhaustive over the catalog-derived harness names: adding or
 * removing a catalog entry without a matching factory fails type checking.
 */
export const harnessAdapterFactories: Readonly<Record<HarnessName, () => HarnessAdapter>> = {
  agy: () => new AgyAdapter(),
  codex: () => new CodexAdapter(),
  mock: () => new MockAdapter(),
  opencode: () => new OpencodeAdapter(),
  pi: () => new PiAdapter(),
};

export function getHarnessAdapter(name: string): HarnessAdapter {
  let harness: HarnessName;
  try {
    harness = lookupHarness(name).name;
  } catch {
    throw new Error(
      `Unknown harness adapter: "${name}". Available adapters: ${availableHarnessNames().join(
        ', ',
      )}`,
    );
  }
  return harnessAdapterFactories[harness]();
}

export * from './types.js';
export * from './mock.js';
export * from './agy/agy.js';
export * from './opencode/opencode.js';
export * from './codex/codex.js';
export * from './pi/pi.js';
