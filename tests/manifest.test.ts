import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { getSpecsDir } from '../src/core/layout.js';
import { createNewSpec } from '../src/core/new.js';
import { type PlanRecord, appendPlanRecord, getPlanLogPath } from '../src/core/planning.js';
import { installFakeValidator } from './helpers.js';

function sha256(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

function planStarted(sessionId: string): PlanRecord {
  return {
    type: 'plan_started',
    sessionId,
    timestamp: new Date().toISOString(),
    data: {
      harness: 'opencode',
      model: 'test-model',
      osqVersion: '0.0.0-test',
      briefHash: 'sha256:brief',
    },
  };
}

function planExited(sessionId: string): PlanRecord {
  return {
    type: 'plan_exited',
    sessionId,
    timestamp: new Date().toISOString(),
    data: {
      exitCode: 0,
      wallSeconds: 1,
      usage: {
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
        reasoningTokens: null,
        cost: null,
      },
    },
  };
}

const PROPOSAL = `---
title: Manifest Probe
verify: node -e "process.exit(0)"
features:
  reads:
    - watcher-and-harness
---
## Goal

Probe the approval manifest.

## Contract

| Input | Expected Output |
|---|---|
| a | b |

## Non-goals

None.

## Delta

Adds a manifest requirement to metrics-and-reporting.
`;

describe('run manifest', () => {
  let tmpDir: string;
  let specFolder: string;

  const agentsContent = '# AGENTS\n\ncustom agents block\n';
  const plannerContent = '# PLANNER\n\ncustom planner block\n';
  const configContent = 'export default { harness: "agy" };\n';
  const watcherSpecContent = '# watcher-and-harness\n\ncontent\n';
  const metricsSpecContent = '# metrics-and-reporting\n\ncontent\n';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-manifest-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Manifest Probe');
    specFolder = spec.folderPath;

    await fs.writeFile(path.join(specFolder, 'proposal.md'), PROPOSAL, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), agentsContent, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'PLANNER.md'), plannerContent, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'osq.config.ts'), configContent, 'utf8');

    const specsDir = getSpecsDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir);
    await fs.mkdir(path.join(specsDir, 'watcher-and-harness'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'watcher-and-harness', 'spec.md'), watcherSpecContent);
    await fs.mkdir(path.join(specsDir, 'metrics-and-reporting'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'metrics-and-reporting', 'spec.md'), metricsSpecContent);

    // `metrics-and-reporting` is a written capability declared by a delta spec.
    const deltaDir = path.join(specFolder, 'specs', 'metrics-and-reporting');
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.writeFile(path.join(deltaDir, 'spec.md'), '# delta\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function readManifest(): Promise<Record<string, unknown>> {
    const raw = await fs.readFile(path.join(specFolder, '.run', 'manifest.json'), 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  }

  it('writes .run/manifest.json with hashes and metadata on approval', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const manifest = await readManifest();
    const hashes = manifest.hashes as Record<string, string | null>;

    assert.equal(hashes['AGENTS.md'], sha256(agentsContent));
    assert.equal(hashes['PLANNER.md'], sha256(plannerContent));
    assert.equal(hashes.config, sha256(configContent));
    assert.equal(hashes['watcher-and-harness'], sha256(watcherSpecContent));
    assert.equal(hashes['metrics-and-reporting'], sha256(metricsSpecContent));

    assert.equal(typeof manifest.osqVersion, 'string');
    assert.ok((manifest.osqVersion as string).length > 0);
    assert.equal(manifest.harness, DEFAULT_CONFIG.harness);
    assert.equal(typeof manifest.model, 'string');
    assert.equal(manifest.planner, null);
    assert.equal(manifest.effort, null);

    assert.equal(typeof manifest.createdAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(manifest.createdAt as string)));
    assert.equal(typeof manifest.approvedAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(manifest.approvedAt as string)));

    assert.equal(manifest.planningSessions, 0);
  });

  it('records null for a hashed file that does not exist', async () => {
    const ghostDeltaDir = path.join(specFolder, 'specs', 'ghost-capability');
    await fs.mkdir(ghostDeltaDir, { recursive: true });
    await fs.writeFile(path.join(ghostDeltaDir, 'spec.md'), '# ghost\n', 'utf8');

    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const manifest = await readManifest();
    const hashes = manifest.hashes as Record<string, string | null>;
    assert.equal(hashes['ghost-capability'], null);
  });

  it('counts valid plan_started records, including resumed sessions without exits', async () => {
    await appendPlanRecord(specFolder, planStarted('new-session'));
    await appendPlanRecord(specFolder, planStarted('resumed-session'));
    await appendPlanRecord(specFolder, planExited('resumed-session'));
    // An exit without a matching start is not a session.
    await appendPlanRecord(specFolder, planExited('orphan-exit'));

    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const manifest = await readManifest();
    assert.equal(manifest.planningSessions, 2);
    assert.equal(typeof manifest.planningSessions, 'number');
  });

  it('tolerates a missing, empty, or partially malformed planning log', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    assert.equal((await readManifest()).planningSessions, 0);

    const planLog = getPlanLogPath(specFolder);
    await fs.mkdir(path.dirname(planLog), { recursive: true });
    await fs.writeFile(planLog, '', 'utf8');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    assert.equal((await readManifest()).planningSessions, 0);

    const malformed = [
      JSON.stringify(planStarted('valid-only')),
      '',
      '{ not json',
      JSON.stringify({ type: 'mystery', sessionId: 'x', timestamp: new Date().toISOString() }),
      JSON.stringify({ type: 'plan_started', sessionId: '', timestamp: '' }),
      JSON.stringify(planExited('never-started')),
      '   ',
    ].join('\n');
    await fs.writeFile(planLog, `${malformed}\n`, 'utf8');

    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    assert.equal((await readManifest()).planningSessions, 1);
  });

  it('changes planningSessions when only the plan log changes, keeping the approved hash', async () => {
    const first = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    assert.equal((await readManifest()).planningSessions, 0);

    await appendPlanRecord(specFolder, planStarted('first-session'));
    const second = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    assert.equal((await readManifest()).planningSessions, 1);
    assert.equal(second.hash, first.hash);

    await appendPlanRecord(specFolder, planStarted('second-session'));
    const third = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    assert.equal((await readManifest()).planningSessions, 2);
    assert.equal(third.hash, first.hash);
  });
});
