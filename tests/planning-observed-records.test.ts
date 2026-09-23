import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  parsePlanRecords,
  planningRecordSource,
  readPlanRecords,
  recordPlanStarted,
} from '../src/core/report/planning.js';

describe('planning record source compatibility', () => {
  it('reads a legacy record without a source as owned', () => {
    const records = parsePlanRecords(
      JSON.stringify({
        type: 'plan_started',
        sessionId: 'legacy',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: {
          harness: 'agy',
          model: 'legacy-model',
          osqVersion: '1.0.0',
          briefHash: 'sha256:x',
        },
      }),
    );
    assert.equal(records.length, 1);
    assert.equal(records[0].source, undefined);
    assert.equal(planningRecordSource(records[0]), 'owned');
    assert.equal(records[0].type === 'plan_started' && records[0].data.model, 'legacy-model');
  });

  it('parses observed records with nullable model, exit code, and usage', () => {
    const records = parsePlanRecords(
      [
        JSON.stringify({
          type: 'plan_started',
          sessionId: 'observed:claude:abc',
          timestamp: '2026-01-01T00:00:00.000Z',
          source: 'observed',
          data: { harness: 'claude', model: null, osqVersion: '1.0.0', briefHash: 'sha256:b' },
        }),
        JSON.stringify({
          type: 'plan_exited',
          sessionId: 'observed:claude:abc',
          timestamp: '2026-01-01T00:00:12.000Z',
          source: 'observed',
          data: {
            exitCode: null,
            wallSeconds: 12,
            usage: {
              inputTokens: 100,
              outputTokens: null,
              cachedTokens: 25,
              reasoningTokens: 10,
              cost: 0.42,
            },
          },
        }),
      ].join('\n'),
    );
    assert.equal(records.length, 2);
    const started = records[0];
    const exited = records[1];
    assert.equal(started.type === 'plan_started' && started.data.model, null);
    assert.equal(planningRecordSource(started), 'observed');
    assert.equal(exited.type === 'plan_exited' && exited.data.exitCode, null);
    assert.equal(planningRecordSource(exited), 'observed');
    if (exited.type === 'plan_exited') {
      assert.deepEqual(exited.data.usage, {
        inputTokens: 100,
        outputTokens: null,
        cachedTokens: 25,
        reasoningTokens: 10,
        cost: 0.42,
      });
    }
  });

  it('writes source owned for new owned lifecycle records', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-owned-record-'));
    try {
      const briefPath = path.join(root, 'brief.md');
      await fs.writeFile(briefPath, '# brief\n', 'utf8');
      await recordPlanStarted(root, { harness: 'mock', model: 'owned-model', briefPath });
      const records = await readPlanRecords(root);
      assert.equal(records.length, 1);
      assert.equal(records[0].source, 'owned');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
