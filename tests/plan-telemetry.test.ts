import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { planCommand } from '../src/cli/plan.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import {
  NULL_PLANNING_USAGE,
  correlatePlanSessions,
  getPlanLogPath,
  hashBriefBytes,
  parsePlanRecords,
  readPlanRecords,
  readPlanningSessions,
  resolveOsqPackageVersion,
} from '../src/core/report/planning.js';
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import { getChangesDir } from '../src/core/status/layout.js';
import { AgyAdapter } from '../src/harness/agy/agy.js';
import { CodexAdapter } from '../src/harness/codex/codex.js';
import { OpencodeAdapter } from '../src/harness/opencode/opencode.js';
import { NULL_INTERACTIVE_USAGE } from '../src/harness/types.js';
import { installFakeValidator } from './helpers.js';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(TESTS_DIR, 'fixtures', 'planning');
const FAKE_PLANNER = path.join(FIXTURES_DIR, 'fake-planner.mjs');
const OPENCODE_FIXTURE = path.join(FIXTURES_DIR, 'opencode-session.json');
const CODEX_FIXTURE = path.join(FIXTURES_DIR, 'codex-rollout.jsonl');

const OPENCODE_CONFIG = `export default {
  harness: 'opencode',
  planner: { harness: 'opencode', model: 'oc-planner', agent: 'osq-planner' },
};
`;
const AGY_CONFIG = `export default {
  harness: 'agy',
  planner: { harness: 'agy', model: 'agy-planner' },
};
`;
const CODEX_CONFIG = `export default {
  harness: 'codex',
  planner: { harness: 'codex', model: 'gpt-x' },
};
`;

const ENV_KEYS = [
  'OPENCODE_PATH',
  'AGY_PATH',
  'CODEX_PATH',
  'CODEX_HOME',
  'OSQ_OPENCODE_ARTIFACT',
  'OSQ_OPENCODE_FIXTURE',
  'OSQ_CODEX_ROLLOUT_DIR',
  'OSQ_CODEX_ROLLOUT_FIXTURE',
  'OSQ_FAKE_DELAY_MS',
  'OSQ_FAKE_EXIT_CODE',
  'OSQ_FAKE_PLAN_PROBE_OUT',
] as const;
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

function renderFixture(template: string, values: Record<string, string | number>): string {
  return template.replace(/__([A-Z_]+)__/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}

async function createProject(config: string): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-telemetry-'));
  await installFakeValidator(project);
  await scaffoldProject(project);
  await fs.writeFile(path.join(project, 'osq.config.ts'), config, 'utf8');
  await fs.writeFile(
    path.join(project, 'brief-source.md'),
    '# Telemetry brief\n\nPlan the change.\n',
    'utf8',
  );
  return project;
}

async function changeFolder(project: string, slug: string): Promise<string> {
  const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, project);
  const entries = await fs.readdir(changesDir);
  const folder = entries.find((entry) => entry.includes(slug));
  assert.ok(folder, `change folder for ${slug} should exist`);
  return path.join(changesDir, folder);
}

/** Captures stdout for the duration of `run`. */
async function captureStdout(run: () => Promise<void>): Promise<string> {
  let output = '';
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Buffer) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
  } finally {
    process.stdout.write = original;
  }
  return output;
}

describe('planning telemetry', () => {
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

  describe('core planning helpers', () => {
    it('hashes the exact brief bytes and resolves the package version', async () => {
      const digest = crypto.createHash('sha256').update(Buffer.from('exact-bytes')).digest('hex');
      assert.equal(hashBriefBytes(Buffer.from('exact-bytes')), `sha256:${digest}`);
      assert.equal(hashBriefBytes('exact-bytes'), `sha256:${digest}`);

      const pkg = JSON.parse(
        await fs.readFile(path.join(TESTS_DIR, '..', 'package.json'), 'utf8'),
      ) as { version: string };
      assert.equal(await resolveOsqPackageVersion(), pkg.version);

      assert.deepEqual(NULL_PLANNING_USAGE, {
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
        reasoningTokens: null,
        cost: null,
      });
    });

    it('skips malformed lines and correlates sessions defensively', () => {
      const content = [
        '{ not json',
        JSON.stringify({
          type: 'plan_started',
          sessionId: 's1',
          timestamp: '2026-01-01T00:00:00.000Z',
          data: {
            harness: 'opencode',
            model: 'm',
            agent: 'a',
            osqVersion: '0.1.0',
            briefHash: 'sha256:x',
          },
        }),
        JSON.stringify({
          type: 'plan_exited',
          sessionId: 's1',
          timestamp: '2026-01-01T00:00:01.000Z',
          data: {
            exitCode: 0,
            wallSeconds: 1,
            usage: {
              inputTokens: 5,
              outputTokens: -2,
              cachedTokens: null,
              reasoningTokens: null,
              cost: 0,
            },
          },
        }),
        JSON.stringify({
          type: 'plan_started',
          sessionId: 's2',
          timestamp: '2026-01-01T00:00:02.000Z',
          data: { harness: 'agy', model: 'g', osqVersion: '0.1.0', briefHash: 'sha256:y' },
        }),
        '{"type":"plan_exited"}',
      ].join('\n');

      const records = parsePlanRecords(content);
      assert.equal(records.length, 3);

      const sessions = correlatePlanSessions(records);
      assert.equal(sessions.length, 2);
      assert.equal(sessions[0].sessionId, 's1');
      assert.equal(sessions[0].started?.data.harness, 'opencode');
      assert.equal(sessions[0].exited?.data.exitCode, 0);
      // Negative counters become unavailable; an observed zero stays zero.
      assert.equal(sessions[0].exited?.data.usage.outputTokens, null);
      assert.equal(sessions[0].exited?.data.usage.cost, 0);
      assert.equal(sessions[1].sessionId, 's2');
      assert.equal(sessions[1].exited, null);
    });

    it('reads a missing planning log as empty', async () => {
      assert.deepEqual(await readPlanRecords('/nonexistent/change-folder'), []);
      assert.deepEqual(await readPlanningSessions('/nonexistent/change-folder'), []);
    });
  });

  describe('planCommand lifecycle', () => {
    it('appends a correlated pair with exact OpenCode usage before and after spawn', async () => {
      tmp = await createProject(OPENCODE_CONFIG);
      const artifact = path.join(tmp, 'artifacts', 'opencode-session.json');
      const probe = path.join(tmp, 'probe.txt');
      process.env.OPENCODE_PATH = FAKE_PLANNER;
      process.env.OSQ_OPENCODE_ARTIFACT = artifact;
      process.env.OSQ_OPENCODE_FIXTURE = OPENCODE_FIXTURE;
      process.env.OSQ_FAKE_DELAY_MS = '120';
      process.env.OSQ_FAKE_PLAN_PROBE_OUT = probe;

      await planCommand('telemetry-oc', {
        brief: path.join(tmp, 'brief-source.md'),
        session: true,
        cwd: tmp,
      });

      const folder = await changeFolder(tmp, 'telemetry-oc');
      const records = await readPlanRecords(folder);
      assert.equal(records.length, 2);
      const [started, exited] = records;
      assert.equal(started.type, 'plan_started');
      assert.equal(exited.type, 'plan_exited');
      assert.equal(started.sessionId, exited.sessionId);
      assert.ok(started.timestamp <= exited.timestamp, 'records are appended in order');

      if (started.type !== 'plan_started' || exited.type !== 'plan_exited') {
        assert.fail('expected a correlated lifecycle pair');
      }
      assert.equal(started.data.harness, 'opencode');
      assert.equal(started.data.model, 'oc-planner');
      assert.equal(started.data.agent, 'osq-planner');
      assert.equal(started.data.osqVersion, await resolveOsqPackageVersion());
      const briefBytes = await fs.readFile(path.join(folder, 'brief.md'));
      assert.equal(started.data.briefHash, hashBriefBytes(briefBytes));

      assert.equal(exited.data.exitCode, 0);
      assert.ok(exited.data.wallSeconds > 0, 'wall time must be non-zero');
      assert.deepEqual(exited.data.usage, {
        inputTokens: 1111,
        outputTokens: 222,
        cachedTokens: 499,
        reasoningTokens: 33,
        cost: 0.125,
      });

      // The start record was already on disk while the planner process ran.
      assert.equal(await fs.readFile(probe, 'utf8'), '1');
    });

    it('records a non-zero exit and preserves propagation', async () => {
      tmp = await createProject(OPENCODE_CONFIG);
      process.env.OPENCODE_PATH = FAKE_PLANNER;
      process.env.OSQ_FAKE_DELAY_MS = '80';
      process.env.OSQ_FAKE_EXIT_CODE = '3';

      await planCommand('telemetry-exit', {
        brief: path.join(tmp, 'brief-source.md'),
        session: true,
        cwd: tmp,
      });

      const records = await readPlanRecords(await changeFolder(tmp, 'telemetry-exit'));
      assert.equal(records.length, 2);
      const exited = records[1];
      if (exited.type !== 'plan_exited') {
        assert.fail('expected a plan_exited record');
      }
      assert.equal(exited.data.exitCode, 3);
      assert.deepEqual(exited.data.usage, NULL_PLANNING_USAGE);
      assert.equal(process.exitCode, 3);
    });

    it('records plan_exited when the planner binary cannot spawn', async () => {
      tmp = await createProject(OPENCODE_CONFIG);
      process.env.OPENCODE_PATH = path.join(tmp, 'missing-opencode');

      await planCommand('telemetry-nospawn', {
        brief: path.join(tmp, 'brief-source.md'),
        session: true,
        cwd: tmp,
      });

      const records = await readPlanRecords(await changeFolder(tmp, 'telemetry-nospawn'));
      assert.equal(records.length, 2);
      const exited = records[1];
      if (exited.type !== 'plan_exited') {
        assert.fail('expected a plan_exited record');
      }
      assert.equal(exited.data.exitCode, 1);
      assert.deepEqual(exited.data.usage, NULL_PLANNING_USAGE);
      assert.equal(process.exitCode, 1);
    });

    it('resumes without rewriting the brief and keeps the approved hash independent', async () => {
      tmp = await createProject(OPENCODE_CONFIG);
      process.env.OPENCODE_PATH = FAKE_PLANNER;
      process.env.OSQ_FAKE_DELAY_MS = '80';

      await planCommand('telemetry-resume', {
        brief: path.join(tmp, 'brief-source.md'),
        session: true,
        cwd: tmp,
      });
      const folder = await changeFolder(tmp, 'telemetry-resume');
      const briefBefore = await fs.readFile(path.join(folder, 'brief.md'), 'utf8');
      const hashBefore = await hashChangeFolder(folder);

      await planCommand('001', { session: true, cwd: tmp });

      assert.equal(await fs.readFile(path.join(folder, 'brief.md'), 'utf8'), briefBefore);
      assert.equal(await hashChangeFolder(folder), hashBefore);

      const sessions = await readPlanningSessions(folder);
      assert.equal(sessions.length, 2);
      assert.notEqual(sessions[0].sessionId, sessions[1].sessionId);
      for (const session of sessions) {
        assert.ok(session.started, 'each session has a start record');
        assert.ok(session.exited, 'each session has an exit record');
        assert.equal(session.started?.data.briefHash, hashBriefBytes(briefBefore));
      }
      const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, tmp);
      const entries = (await fs.readdir(changesDir)).filter((entry) => entry !== 'archive');
      assert.deepEqual(entries, ['001-telemetry-resume']);
    });

    it('print mode appends no planning event', async () => {
      tmp = await createProject(OPENCODE_CONFIG);
      process.env.OPENCODE_PATH = path.join(tmp, 'must-not-spawn');

      const output = await captureStdout(() =>
        planCommand('telemetry-print', {
          brief: path.join(tmp, 'brief-source.md'),
          print: true,
          cwd: tmp,
        }),
      );
      assert.ok(output.includes('## Brief'));

      const folder = await changeFolder(tmp, 'telemetry-print');
      assert.deepEqual(await readPlanRecords(folder), []);
      await assert.rejects(fs.stat(getPlanLogPath(folder)));
      assert.equal(process.exitCode, undefined);
    });
  });

  describe('all harness identities through planCommand', () => {
    it('records AGY timing with all-null usage', async () => {
      tmp = await createProject(AGY_CONFIG);
      process.env.AGY_PATH = FAKE_PLANNER;
      process.env.OSQ_FAKE_DELAY_MS = '120';

      await planCommand('telemetry-agy', {
        brief: path.join(tmp, 'brief-source.md'),
        session: true,
        cwd: tmp,
      });

      const records = await readPlanRecords(await changeFolder(tmp, 'telemetry-agy'));
      assert.equal(records.length, 2);
      const [started, exited] = records;
      if (started.type !== 'plan_started' || exited.type !== 'plan_exited') {
        assert.fail('expected a correlated lifecycle pair');
      }
      assert.equal(started.data.harness, 'agy');
      assert.equal(started.data.model, 'agy-planner');
      assert.equal(Object.hasOwn(started.data, 'agent'), false);
      assert.ok(exited.data.wallSeconds > 0);
      assert.deepEqual(exited.data.usage, NULL_PLANNING_USAGE);
    });

    it('records Codex identity with rollout usage and null cost', async () => {
      tmp = await createProject(CODEX_CONFIG);
      const codexHome = path.join(tmp, 'codex-home');
      process.env.CODEX_PATH = FAKE_PLANNER;
      process.env.CODEX_HOME = codexHome;
      process.env.OSQ_CODEX_ROLLOUT_DIR = path.join(codexHome, 'sessions', '2026', '09', '21');
      process.env.OSQ_CODEX_ROLLOUT_FIXTURE = CODEX_FIXTURE;
      process.env.OSQ_FAKE_DELAY_MS = '150';

      await planCommand('telemetry-codex', {
        brief: path.join(tmp, 'brief-source.md'),
        session: true,
        cwd: tmp,
      });

      const records = await readPlanRecords(await changeFolder(tmp, 'telemetry-codex'));
      assert.equal(records.length, 2);
      const [started, exited] = records;
      if (started.type !== 'plan_started' || exited.type !== 'plan_exited') {
        assert.fail('expected a correlated lifecycle pair');
      }
      assert.equal(started.data.harness, 'codex');
      assert.equal(started.data.model, 'gpt-x');
      assert.equal(Object.hasOwn(started.data, 'agent'), false);
      assert.deepEqual(exited.data.usage, {
        inputTokens: 1000,
        outputTokens: 200,
        cachedTokens: 300,
        reasoningTokens: 40,
        cost: null,
      });
    });
  });

  describe('harness usage readers', () => {
    it('OpenCode selects the one row by cwd and interval and sums cache counters', async () => {
      tmp = await createProject(OPENCODE_CONFIG);
      const artifact = path.join(tmp, 'artifacts', 'opencode-session.json');
      process.env.OPENCODE_PATH = FAKE_PLANNER;
      process.env.OSQ_OPENCODE_ARTIFACT = artifact;

      const now = Date.now();
      const template = await fs.readFile(OPENCODE_FIXTURE, 'utf8');
      await fs.mkdir(path.dirname(artifact), { recursive: true });
      await fs.writeFile(artifact, renderFixture(template, { CWD: tmp, NOW_MS: now }), 'utf8');

      const result = await new OpencodeAdapter().readInteractiveUsage({
        cwd: tmp,
        startedAt: new Date(now - 5000).toISOString(),
        endedAt: new Date(now + 5000).toISOString(),
      });
      assert.deepEqual(result, {
        inputTokens: 1111,
        outputTokens: 222,
        cachedTokens: 499,
        reasoningTokens: 33,
        cost: 0.125,
      });
    });

    it('OpenCode returns all null for ambiguity, malformed data, and read failure', async () => {
      tmp = await createProject(OPENCODE_CONFIG);
      const artifact = path.join(tmp, 'artifacts', 'opencode-session.json');
      process.env.OPENCODE_PATH = FAKE_PLANNER;
      process.env.OSQ_OPENCODE_ARTIFACT = artifact;
      await fs.mkdir(path.dirname(artifact), { recursive: true });

      const now = Date.now();
      const interval = {
        cwd: tmp,
        startedAt: new Date(now - 5000).toISOString(),
        endedAt: new Date(now + 5000).toISOString(),
      };
      const adapter = new OpencodeAdapter();
      const row = {
        directory: tmp,
        time_created: now,
        tokens_input: 1,
        tokens_output: 2,
        tokens_reasoning: 3,
        tokens_cache_read: 4,
        tokens_cache_write: 5,
        cost: 0.5,
      };

      await fs.writeFile(artifact, JSON.stringify({ rows: [row, row] }), 'utf8');
      assert.deepEqual(await adapter.readInteractiveUsage(interval), NULL_INTERACTIVE_USAGE);

      await fs.writeFile(artifact, 'not json at all', 'utf8');
      assert.deepEqual(await adapter.readInteractiveUsage(interval), NULL_INTERACTIVE_USAGE);

      process.env.OPENCODE_PATH = path.join(tmp, 'missing-opencode');
      assert.deepEqual(await adapter.readInteractiveUsage(interval), NULL_INTERACTIVE_USAGE);
    });

    it('Codex selects the one new rollout by session_meta cwd', async () => {
      tmp = await createProject(CODEX_CONFIG);
      const codexHome = path.join(tmp, 'codex-home');
      process.env.CODEX_HOME = codexHome;
      const now = Date.now();
      const rolloutDir = path.join(codexHome, 'sessions', '2026', '09', '21');
      await fs.mkdir(rolloutDir, { recursive: true });
      const template = await fs.readFile(CODEX_FIXTURE, 'utf8');
      await fs.writeFile(
        path.join(rolloutDir, `rollout-${now}.jsonl`),
        renderFixture(template, { CWD: tmp, NOW_ISO: new Date(now).toISOString() }),
        'utf8',
      );

      const result = await new CodexAdapter().readInteractiveUsage({
        cwd: tmp,
        startedAt: new Date(now - 5000).toISOString(),
        endedAt: new Date(now + 5000).toISOString(),
      });
      assert.deepEqual(result, {
        inputTokens: 1000,
        outputTokens: 200,
        cachedTokens: 300,
        reasoningTokens: 40,
        cost: null,
      });
    });

    it('Codex returns all null for ambiguity, cwd mismatch, and missing usage', async () => {
      tmp = await createProject(CODEX_CONFIG);
      const codexHome = path.join(tmp, 'codex-home');
      process.env.CODEX_HOME = codexHome;
      const now = Date.now();
      const rolloutDir = path.join(codexHome, 'sessions', '2026', '09', '21');
      await fs.mkdir(rolloutDir, { recursive: true });
      const interval = {
        cwd: tmp,
        startedAt: new Date(now - 5000).toISOString(),
        endedAt: new Date(now + 5000).toISOString(),
      };
      const adapter = new CodexAdapter();
      const meta = (cwd: string, timestamp: string) =>
        JSON.stringify({ type: 'session_meta', payload: { cwd, timestamp } });
      const iso = new Date(now).toISOString();

      await fs.writeFile(path.join(rolloutDir, 'a.jsonl'), `${meta(tmp, iso)}\n`, 'utf8');
      await fs.writeFile(path.join(rolloutDir, 'b.jsonl'), `${meta(tmp, iso)}\n`, 'utf8');
      assert.deepEqual(await adapter.readInteractiveUsage(interval), NULL_INTERACTIVE_USAGE);

      await fs.rm(path.join(rolloutDir, 'a.jsonl'));
      await fs.rm(path.join(rolloutDir, 'b.jsonl'));
      await fs.writeFile(
        path.join(rolloutDir, 'c.jsonl'),
        `${meta('/somewhere/else', iso)}\n`,
        'utf8',
      );
      assert.deepEqual(await adapter.readInteractiveUsage(interval), NULL_INTERACTIVE_USAGE);

      await fs.writeFile(path.join(rolloutDir, 'd.jsonl'), `${meta(tmp, iso)}\n`, 'utf8');
      assert.deepEqual(await adapter.readInteractiveUsage(interval), NULL_INTERACTIVE_USAGE);
    });

    it('AGY returns explicit all-null usage', async () => {
      const result = await new AgyAdapter().readInteractiveUsage({
        cwd: '/project',
        startedAt: '2026-01-01T00:00:00.000Z',
        endedAt: '2026-01-01T00:00:01.000Z',
      });
      assert.deepEqual(result, NULL_INTERACTIVE_USAGE);
    });
  });
});
