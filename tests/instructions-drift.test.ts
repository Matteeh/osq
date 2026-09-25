import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { retrySpec } from '../src/core/lifecycle/retry.js';
import { buildManifest } from '../src/core/run/manifest.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { formatShowOutput, getSpecDetails } from '../src/core/status/show.js';
import { MockAdapter } from '../src/harness/mock.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const CAPABILITY = 'ingress';

function proposalMd(title: string, decisions: string): string {
  return `---
title: ${title}
depends_on: []
verify: node verify.cjs
features:
  reads: []
---
## Goal

A drift probe.

## Verify

\`node verify.cjs\`

## Non-goals

- none

## Surface

None

## Decisions

${decisions}

## Contract

### Requirement: Drift

The system SHALL observe drift.

#### Scenario: Drift
- **WHEN** drift occurs
- **THEN** it is observed

## Human steps

None

## Delta

- \`specs/${CAPABILITY}/spec.md\`: adds drift coverage.
`;
}

function taskMd(title: string): string {
  return `---
title: ${title}
verify: node verify.cjs
verify_starts: green
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] drift observed
`;
}

const DELTA_MD = `# Spec Delta: Ingress

## ADDED Requirements

### Requirement: Ingress routing

The system SHALL route ingress.

#### Scenario: Route
- **WHEN** a request arrives
- **THEN** it is routed
`;

const LIVING_MD = `# ingress Specification

## Purpose

Routes ingress.

## Requirements

### Requirement: Existing routing

The system SHALL route.

#### Scenario: Route
- **WHEN** a request arrives
- **THEN** it is routed
`;

function adrMd(number: string, rule: string): string {
  return `---
status: accepted
applies_to:
  - ${CAPABILITY}
rule: ${rule}
---
# ${number}. Ingress decision

Body text.
`;
}

function sha256(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

class RecordingLogger implements Logger {
  readonly warnings: string[] = [];
  readonly infos: string[] = [];
  readonly symbols = false;
  readonly interactive = false;

  info(msg: string): void {
    this.infos.push(msg);
  }
  verbose(_msg: string): void {}
  warn(msg: string): void {
    this.warnings.push(msg);
  }
  error(_msg: string): void {}
  status(_text: string): void {}
  clearStatus(): void {}
}

interface SetupOptions {
  adr?: { number: string; rule: string };
}

interface Project {
  projectRoot: string;
  specFolderPath: string;
}

async function setupProject(title: string, options: SetupOptions = {}): Promise<Project> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-drift-'));
  await installFakeValidator(projectRoot);
  await scaffoldProject(projectRoot);
  await fs.writeFile(path.join(projectRoot, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');

  const spec = await createNewSpec(projectRoot, title);
  const decisions = options.adr ? `ADR ${options.adr.number}: ${options.adr.rule}` : 'None';
  await fs.writeFile(
    path.join(spec.folderPath, 'proposal.md'),
    proposalMd(title, decisions),
    'utf8',
  );
  await fs.writeFile(path.join(spec.folderPath, 'tasks', '1.md'), taskMd(title), 'utf8');

  if (options.adr) {
    await fs.mkdir(path.join(spec.folderPath, 'specs', CAPABILITY), { recursive: true });
    await fs.writeFile(
      path.join(spec.folderPath, 'specs', CAPABILITY, 'spec.md'),
      DELTA_MD,
      'utf8',
    );
    await fs.mkdir(path.join(projectRoot, 'openspec', 'specs', CAPABILITY), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, 'openspec', 'specs', CAPABILITY, 'spec.md'),
      LIVING_MD,
      'utf8',
    );
    await fs.mkdir(path.join(projectRoot, 'decisions'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, 'decisions', `${options.adr.number}-probe.md`),
      adrMd(options.adr.number, options.adr.rule),
      'utf8',
    );
  }

  await approveSpec(projectRoot, '001', DEFAULT_CONFIG);
  return { projectRoot, specFolderPath: spec.folderPath };
}

async function addAdr(projectRoot: string, number: string, rule: string): Promise<void> {
  await fs.mkdir(path.join(projectRoot, 'decisions'), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, 'decisions', `${number}-probe.md`),
    adrMd(number, rule),
    'utf8',
  );
}

interface RecordedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolderPath: string, taskNumber = '1'): Promise<RecordedEvent[]> {
  const raw = await fs
    .readFile(path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as RecordedEvent);
}

async function editAgents(projectRoot: string): Promise<void> {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  const current = await fs.readFile(agentsPath, 'utf8');
  await fs.writeFile(agentsPath, `${current}\nEdited after approval.\n`, 'utf8');
}

async function readManifest(specFolderPath: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(path.join(specFolderPath, '.run', 'manifest.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('instructions drift', () => {
  let projectRoot: string | null = null;

  beforeEach(() => {
    projectRoot = null;
  });

  afterEach(async () => {
    if (projectRoot) {
      await fs.rm(projectRoot, { recursive: true, force: true });
      projectRoot = null;
    }
  });

  async function project(title: string, options: SetupOptions = {}): Promise<Project> {
    const created = await setupProject(title, options);
    projectRoot = created.projectRoot;
    return created;
  }

  describe('governing decisions in the manifest', () => {
    it('records each governing ADR hash on approval and omits decisions at plan time', async () => {
      const { projectRoot: root, specFolderPath } = await project('Manifest Decisions', {
        adr: { number: '009', rule: 'The ingress capability routes every request.' },
      });

      const manifest = await readManifest(specFolderPath);
      const decisions = manifest.decisions as Record<string, string>;
      assert.deepEqual(Object.keys(decisions), ['009']);

      const adrContent = await fs.readFile(path.join(root, 'decisions', '009-probe.md'), 'utf8');
      assert.equal(decisions['009'], sha256(adrContent));

      const planningOnly = await buildManifest(root, specFolderPath, DEFAULT_CONFIG);
      assert.equal(planningOnly.decisions, undefined);
    });

    it('records an empty decisions object for an approval with no governing ADR', async () => {
      const { specFolderPath } = await project('No Decisions');
      const manifest = await readManifest(specFolderPath);
      assert.deepEqual(manifest.decisions, {});
    });
  });

  describe('instructions changed after approval', () => {
    it('appends one event, warns, and still runs when AGENTS.md changed', async () => {
      const { projectRoot: root, specFolderPath } = await project('Agents Drift');
      await editAgents(root);

      const logger = new RecordingLogger();
      const result = await runTask(
        root,
        specFolderPath,
        '1',
        DEFAULT_CONFIG,
        new MockAdapter(),
        logger,
      );

      assert.equal(result.success, true);
      const events = await readEvents(specFolderPath);
      const drift = events.filter((event) => event.type === 'instructions_changed');
      assert.equal(drift.length, 1);
      assert.deepEqual(drift[0].data?.changed, ['AGENTS.md']);
      assert.ok(
        events.some((event) => event.type === 'done'),
        'the agent still ran and completed the task',
      );
      assert.deepEqual(logger.warnings, ['task 1: instructions changed after approval: AGENTS.md']);
    });

    it('reports a new governing ADR accepted after approval', async () => {
      const { projectRoot: root, specFolderPath } = await project('New Adr Drift', {
        adr: { number: '009', rule: 'The ingress capability routes every request.' },
      });
      await addAdr(root, '010', 'The ingress capability keeps routing decisions.');

      const result = await runTask(
        root,
        specFolderPath,
        '1',
        DEFAULT_CONFIG,
        new MockAdapter(),
        new RecordingLogger(),
      );

      assert.equal(result.success, true);
      const drift = (await readEvents(specFolderPath)).filter(
        (event) => event.type === 'instructions_changed',
      );
      assert.equal(drift.length, 1);
      assert.deepEqual(drift[0].data?.changed, ['ADR 010 added']);
    });

    it('reports a changed governing ADR', async () => {
      const { projectRoot: root, specFolderPath } = await project('Changed Adr Drift', {
        adr: { number: '009', rule: 'The ingress capability routes every request.' },
      });
      await fs.writeFile(
        path.join(root, 'decisions', '009-probe.md'),
        adrMd('009', 'The ingress capability routes some requests.'),
        'utf8',
      );

      await runTask(
        root,
        specFolderPath,
        '1',
        DEFAULT_CONFIG,
        new MockAdapter(),
        new RecordingLogger(),
      );

      const drift = (await readEvents(specFolderPath)).filter(
        (event) => event.type === 'instructions_changed',
      );
      assert.equal(drift.length, 1);
      assert.deepEqual(drift[0].data?.changed, ['ADR 009 changed']);
    });

    it('reports a removed governing ADR', async () => {
      const { projectRoot: root, specFolderPath } = await project('Removed Adr Drift', {
        adr: { number: '009', rule: 'The ingress capability routes every request.' },
      });
      await fs.rm(path.join(root, 'decisions', '009-probe.md'));

      await runTask(
        root,
        specFolderPath,
        '1',
        DEFAULT_CONFIG,
        new MockAdapter(),
        new RecordingLogger(),
      );

      const drift = (await readEvents(specFolderPath)).filter(
        (event) => event.type === 'instructions_changed',
      );
      assert.equal(drift.length, 1);
      assert.deepEqual(drift[0].data?.changed, ['ADR 009 removed']);
    });

    it('adds no event and prints no warning when nothing changed', async () => {
      const { projectRoot: root, specFolderPath } = await project('No Drift');
      const logger = new RecordingLogger();

      const result = await runTask(
        root,
        specFolderPath,
        '1',
        DEFAULT_CONFIG,
        new MockAdapter(),
        logger,
      );

      assert.equal(result.success, true);
      const drift = (await readEvents(specFolderPath)).filter(
        (event) => event.type === 'instructions_changed',
      );
      assert.equal(drift.length, 0);
      assert.deepEqual(logger.warnings, []);
    });

    it('adds no event on a second attempt after osq retry', async () => {
      const { projectRoot: root, specFolderPath } = await project('Retry Drift');

      const failing = new MockAdapter();
      failing.setBehavior({ exitCode: 1, writeResult: false });
      const first = await runTask(
        root,
        specFolderPath,
        '1',
        DEFAULT_CONFIG,
        failing,
        new RecordingLogger(),
      );
      assert.equal(first.success, false);

      await retrySpec(root, '001', '1', DEFAULT_CONFIG);
      await editAgents(root);

      const logger = new RecordingLogger();
      const second = await runTask(
        root,
        specFolderPath,
        '1',
        DEFAULT_CONFIG,
        new MockAdapter(),
        logger,
      );
      assert.equal(second.success, true);

      const drift = (await readEvents(specFolderPath)).filter(
        (event) => event.type === 'instructions_changed',
      );
      assert.equal(drift.length, 0);
      assert.deepEqual(logger.warnings, []);
    });

    it('compares only AGENTS.md when the manifest has no decisions field', async () => {
      const { projectRoot: root, specFolderPath } = await project('Legacy Manifest');
      const manifestPath = path.join(specFolderPath, '.run', 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Record<
        string,
        unknown
      >;
      manifest.decisions = undefined;
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      await editAgents(root);
      await runTask(
        root,
        specFolderPath,
        '1',
        DEFAULT_CONFIG,
        new MockAdapter(),
        new RecordingLogger(),
      );

      const drift = (await readEvents(specFolderPath)).filter(
        (event) => event.type === 'instructions_changed',
      );
      assert.equal(drift.length, 1);
      assert.deepEqual(drift[0].data?.changed, ['AGENTS.md']);
    });
  });

  describe('instructions changed in show', () => {
    it('prints the drift line under the task after its latest event', async () => {
      const { projectRoot: root, specFolderPath } = await project('Show Drift', {
        adr: { number: '009', rule: 'The ingress capability routes every request.' },
      });
      await editAgents(root);
      await addAdr(root, '010', 'The ingress capability keeps routing decisions.');
      await runTask(
        root,
        specFolderPath,
        '1',
        DEFAULT_CONFIG,
        new MockAdapter(),
        new RecordingLogger(),
      );

      const details = await getSpecDetails(root, '001', DEFAULT_CONFIG);
      const output = formatShowOutput(details);

      assert.match(output, /Instructions changed after approval: AGENTS\.md, ADR 010 added/);
    });
  });
});
