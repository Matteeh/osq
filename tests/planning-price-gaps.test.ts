import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveCommand } from '../src/cli/approve.js';
import { DEFAULT_PLANNING_CONFIG } from '../src/core/foundation/config-planning.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { type DoctorCheckResult, runDoctorChecks } from '../src/core/foundation/doctor.js';
import {
  findUnpricedPlanningModels,
  formatPriceKey,
} from '../src/core/report/planning-price-gaps.js';
import { appendPlanRecord } from '../src/core/report/planning.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/linter.js';
import {
  captureLogs,
  createChange,
  createProject,
  restoreEnv,
} from './planning-observed-helpers.js';

const MODEL = 'claude-opus-5-5';
const PRICE = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 };

const TOKENS = {
  inputTokens: 10,
  outputTokens: 5,
  cachedTokens: null,
  reasoningTokens: null,
  cost: null,
};

/** Append one owned lifecycle pair; `slice` adds summed slice tokens. */
async function appendSession(
  folder: string,
  model: string | null,
  options: { tokens?: boolean; slice?: boolean } = {},
): Promise<void> {
  const timestamp = '2026-01-01T00:00:00.000Z';
  const sessionId = `session-${model}`;
  await appendPlanRecord(folder, {
    type: 'plan_started',
    sessionId,
    timestamp,
    source: 'owned',
    data: { harness: 'mock', model, osqVersion: '1.0.0', briefHash: 'sha256:brief' },
  });
  const usage =
    options.tokens === false
      ? {
          inputTokens: null,
          outputTokens: null,
          cachedTokens: null,
          reasoningTokens: null,
          cost: null,
        }
      : TOKENS;
  await appendPlanRecord(folder, {
    type: 'plan_exited',
    sessionId,
    timestamp,
    source: 'owned',
    data: {
      exitCode: 0,
      wallSeconds: 1,
      usage,
      ...(options.slice
        ? {
            slice: {
              start: timestamp,
              end: timestamp,
              approvedAt: timestamp,
              lastEditAt: timestamp,
              turns: 1,
              activeMinutes: 0,
              tokens: {
                input: 10,
                output: 5,
                cacheRead: null,
                cacheWrite: null,
                reasoning: null,
              },
              costSource: null,
            },
          }
        : {}),
    },
  });
}

async function changeFolder(root: string, name: string): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', name);
  await fs.mkdir(folder, { recursive: true });
  return folder;
}

async function archiveFolder(root: string, name: string): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', 'archive', name);
  await fs.mkdir(folder, { recursive: true });
  return folder;
}

function mockConfig(prices?: Record<string, typeof PRICE>): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    harness: 'mock',
    planning: { ...DEFAULT_PLANNING_CONFIG, ...(prices ? { prices } : {}) },
  };
}

function findCheck(
  report: { checks: DoctorCheckResult[] },
  name: string,
): DoctorCheckResult | undefined {
  return report.checks.find((check) => check.name === name);
}

describe('findUnpricedPlanningModels', () => {
  let root = '';

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-price-gaps-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('lists sorted distinct recorded-token models with no price key', async () => {
    const sliceFolder = await changeFolder(root, '001-slice');
    await appendSession(sliceFolder, 'zeta-model', { slice: true });
    const usageFolder = await changeFolder(root, '002-usage');
    await appendSession(usageFolder, 'alpha-model');
    const pricedFolder = await changeFolder(root, '003-priced');
    await appendSession(pricedFolder, 'priced-model');
    const emptyFolder = await changeFolder(root, '004-empty');
    await appendSession(emptyFolder, 'empty-model', { tokens: false });
    const noModel = await changeFolder(root, '005-no-model');
    await appendSession(noModel, null);

    const found = await findUnpricedPlanningModels(
      [sliceFolder, usageFolder, pricedFolder, emptyFolder, noModel],
      { 'priced-model': PRICE },
    );
    assert.deepEqual(found, ['alpha-model', 'zeta-model']);
  });

  it('treats a missing price map as every model unpriced', async () => {
    const folder = await changeFolder(root, '001-plain');
    await appendSession(folder, 'only-model', { slice: true });

    assert.deepEqual(await findUnpricedPlanningModels([folder], undefined), ['only-model']);
  });

  it('names the exact configuration key', () => {
    assert.equal(formatPriceKey(MODEL), 'planning.prices["claude-opus-5-5"]');
  });
});

describe('planning price diagnostics', () => {
  let root = '';

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-price-doctor-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  async function runDoctor(config: OsqConfig) {
    return runDoctorChecks(root, {
      loadConfig: async () => config,
      probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
    });
  }

  it('adds the warning check for an archived unpriced model', async () => {
    const folder = await archiveFolder(root, '001-priced-plan');
    await appendSession(folder, MODEL, { slice: true });

    const report = await runDoctor(mockConfig());
    const check = findCheck(report, 'planning-prices');
    assert.ok(check);
    assert.equal(check.ok, true);
    assert.equal(check.warning, true);
    assert.match(check.message, /planning\.prices\["claude-opus-5-5"\]/);
    assert.match(check.message, /unreported/);
  });

  it('keeps the check list unchanged when every model is priced', async () => {
    const folder = await changeFolder(root, '001-priced-plan');
    await appendSession(folder, MODEL, { slice: true });

    const report = await runDoctor(mockConfig({ [MODEL]: PRICE }));
    assert.equal(findCheck(report, 'planning-prices'), undefined);
  });

  it('keeps the check list unchanged with no recorded tokens', async () => {
    const folder = await changeFolder(root, '001-empty-plan');
    await appendSession(folder, MODEL, { tokens: false });

    const report = await runDoctor(mockConfig());
    assert.equal(findCheck(report, 'planning-prices'), undefined);
  });
});

describe('approval price gap notice', () => {
  let root = '';

  beforeEach(() => {
    restoreEnv();
  });

  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  async function preparedChange() {
    root = await createProject();
    const change = await createChange(root, 'Price Gap');
    await appendSession(change.folderPath, MODEL, { slice: true });
    return change;
  }

  it('reports the missing model from approveSpec and the CLI', async () => {
    const change = await preparedChange();

    const result = await approveSpec(root, change.specId, mockConfig(), {
      planningReaders: [],
      now: new Date(),
    });
    assert.deepEqual(result.missingPrices, [MODEL]);

    const lines = await captureLogs(() =>
      approveCommand([change.specId], {
        cwd: root,
        config: mockConfig(),
        planningReaders: [],
        now: new Date(),
      }),
    );
    const notice = lines.filter((line) => line.includes(formatPriceKey(MODEL)));
    assert.equal(notice.length, 1);
    assert.match(notice[0], /unreported/);
  });

  it('stays silent once the model is priced', async () => {
    const change = await preparedChange();

    const result = await approveSpec(root, change.specId, mockConfig({ [MODEL]: PRICE }), {
      planningReaders: [],
      now: new Date(),
    });
    assert.deepEqual(result.missingPrices, []);

    const lines = await captureLogs(() =>
      approveCommand([change.specId], {
        cwd: root,
        config: mockConfig({ [MODEL]: PRICE }),
        planningReaders: [],
        now: new Date(),
      }),
    );
    assert.equal(
      lines.some((line) => line.includes(formatPriceKey(MODEL))),
      false,
    );
  });
});
