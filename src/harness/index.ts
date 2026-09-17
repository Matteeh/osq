import { AgyAdapter } from './agy.js';
import { MockAdapter } from './mock.js';
import type { HarnessAdapter } from './types.js';

const adapters: Record<string, () => HarnessAdapter> = {
  agy: () => new AgyAdapter(),
  mock: () => new MockAdapter(),
};

export function getHarnessAdapter(name: string): HarnessAdapter {
  const factory = adapters[name.toLowerCase()];
  if (!factory) {
    throw new Error(
      `Unknown harness adapter: "${name}". Available adapters: ${Object.keys(adapters).join(', ')}`,
    );
  }
  return factory();
}

export * from './types.js';
export * from './mock.js';
export * from './agy.js';
