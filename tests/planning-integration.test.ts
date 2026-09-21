import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { planCommand } from '../src/cli/plan.js';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { getChangesDir } from '../src/core/layout.js';
import { readPlanRecords } from '../src/core/planning.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report.js';
import { installFakeValidator } from './helpers.js';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FAKE_PLANNER = path.join(TESTS_DIR, 'fixtures', 'planning', 'fake-planner.mjs');

const AGY_CONFIG = `export default {
  harness: 'agy',
  planner: { harness: 'agy', model: 'agy-planner' },
};
`;

const ENV_KEYS = ['AGY_PATH', 'OSQ_FAKE_DELAY_MS', 'OSQ_FAKE_EXIT_CODE'] as const;
const ORIGINAL_ENV = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function resetEnv(): void {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV.get(key);
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
}

describe('planning to report integration', () => {
  let tmp = '';

  beforeEach(() => {
    resetEnv();
    process.exitCode = undefined;
    tmp = '';
  });

  afterEach(async () => {
    resetEnv();
    process.exitCode = undefined;
    if (tmp) {
      await fs.rm(tmp, { recursive: true, force: true });
    }
    tmp = '';
  });

  it('records a real planning session that the report surfaces even with null usage', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-planning-integration-'));
    await installFakeValidator(tmp);
    await scaffoldProject(tmp);
    await fs.writeFile(path.join(tmp, 'osq.config.ts'), AGY_CONFIG, 'utf8');
    const brief = path.join(tmp, 'brief-source.md');
    await fs.writeFile(brief, '# Integration brief\n\nPlan this.\n', 'utf8');

    process.env.AGY_PATH = FAKE_PLANNER;
    process.env.OSQ_FAKE_DELAY_MS = '150';

    await planCommand('integration-plan', { brief, cwd: tmp });

    const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, tmp);
    const entries = await fs.readdir(changesDir);
    const folderName = entries.find((entry) => entry.includes('integration-plan'));
    assert.ok(folderName, 'planCommand should create the change folder');
    const records = await readPlanRecords(path.join(changesDir, folderName));
    assert.equal(records.length, 2, 'exactly one lifecycle pair is appended');

    const report = await getMetricsReport(tmp, DEFAULT_CONFIG);
    assert.equal(report.planning.sessions, 1);
    assert.ok(report.planning.wallSeconds > 0, 'wall time is observed');
    assert.deepEqual(report.planning.wallSecondsByChange, {
      [folderName]: report.planning.wallSeconds,
    });
    // AGY reports no usage, so its one session is counted but not covered.
    assert.deepEqual(report.planning.coverage, { reportedSessions: 0, totalSessions: 1 });
    assert.deepEqual(report.planning.tokens, { input: 0, output: 0, cached: 0, reasoning: 0 });
    assert.equal(report.planning.cost.total, 0);

    const text = formatMetricsReport(report);
    assert.ok(text.includes('0 of 1 sessions reported usage'), text);

    const raw = await reportCommand({
      cwd: tmp,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(raw) as { planning: { sessions: number } };
    assert.equal(parsed.planning.sessions, 1);
  });
});
