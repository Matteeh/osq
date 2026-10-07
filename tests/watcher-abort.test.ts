import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { MockAdapter } from '../src/harness/mock.js';
import { startWatcher } from '../src/watcher/loop.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A scaffolded project with its own temporary root. */
async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-watcher-abort-'));
  await scaffoldProject(root);
  return root;
}

/** Abort `controller` once `turns` `setImmediate` turns have passed. */
function abortAfterTurns(controller: AbortController, turns: number): void {
  let remaining = turns;
  const tick = (): void => {
    if (remaining === 0) {
      controller.abort();
      return;
    }
    remaining--;
    setImmediate(tick);
  };
  setImmediate(tick);
}

describe('Watcher abort', () => {
  it('resolves only after the in-flight cycle finishes when the abort lands during one', async () => {
    const root = await makeProject();
    const controller = new AbortController();
    let calls = 0;
    let secondReturned = false;
    const buildCheck = async (): Promise<string | null> => {
      calls++;
      if (calls === 2) {
        controller.abort();
        await delay(100);
        secondReturned = true;
      }
      return null;
    };

    try {
      await startWatcher(root, DEFAULT_CONFIG, new MockAdapter(), {
        buildCheck,
        signal: controller.signal,
        pollIntervalMs: 5,
      });

      assert.equal(
        secondReturned,
        true,
        'the aborting build check returned before the promise resolved',
      );
      assert.equal(calls, 2, 'the aborting build check ran, and no cycle started after it');
      await delay(100);
      assert.equal(calls, 2, 'the call count stays the same 100 ms later');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('resolves without starting another cycle when the abort lands during setup', async () => {
    for (let turns = 0; turns <= 30; turns++) {
      const root = await makeProject();
      const controller = new AbortController();
      let calls = 0;
      const buildCheck = async (): Promise<string | null> => {
        calls++;
        return null;
      };

      try {
        const pending = startWatcher(root, DEFAULT_CONFIG, new MockAdapter(), {
          buildCheck,
          signal: controller.signal,
          pollIntervalMs: 5,
        });
        abortAfterTurns(controller, turns);
        await pending;

        const settledCalls = calls;
        await delay(50);
        assert.equal(calls, settledCalls, `no cycle after an abort at ${turns} setImmediate turns`);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  });
});
