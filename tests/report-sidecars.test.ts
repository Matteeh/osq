import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';

const LIVING_SPEC = `# capability Specification

## Purpose

A capability used by the report sidecar coverage tests.

## Requirements

### Requirement: Works
The system SHALL work.

#### Scenario: Works
- **WHEN** invoked
- **THEN** it works
`;

interface Run {
  readonly parsed: Record<string, unknown>;
  readonly raw: string;
}

/** A temporary project whose living specs and sidecars the test controls. */
class Project {
  readonly root: string;

  private constructor(root: string) {
    this.root = root;
  }

  static async create(): Promise<Project> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-sidecars-'));
    return new Project(root);
  }

  async writeLivingSpec(capability: string): Promise<void> {
    const dir = path.join(this.root, 'openspec', 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), LIVING_SPEC, 'utf8');
  }

  async writeSidecar(capability: string, content = 'group: platform\n'): Promise<void> {
    const dir = path.join(this.root, 'openspec', 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'osq.yml'), content, 'utf8');
  }

  async report(): Promise<Run> {
    let captured = '';
    const raw = await reportCommand({
      cwd: this.root,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: (msg) => {
        captured = msg;
      },
    });
    const text = captured || raw;
    return { parsed: JSON.parse(text) as Record<string, unknown>, raw: text };
  }

  async remove(): Promise<void> {
    await fs.rm(this.root, { recursive: true, force: true });
  }
}

describe('report sidecar coverage', () => {
  let project: Project;

  beforeEach(async () => {
    project = await Project.create();
  });

  afterEach(async () => {
    await project.remove();
  });

  it('counts living capabilities with and without a sidecar in name order', async () => {
    await project.writeLivingSpec('orders');
    await project.writeLivingSpec('pricing');
    await project.writeSidecar('pricing');

    const { parsed } = await project.report();
    const coverage = parsed.coverage as Record<string, unknown>;

    assert.deepEqual(coverage.capabilities, {
      withSidecar: ['pricing'],
      withoutSidecar: ['orders'],
    });
  });

  it('omits coverage.capabilities when the project has no living capability spec', async () => {
    const { parsed, raw } = await project.report();
    const coverage = parsed.coverage as Record<string, unknown>;

    assert.ok(!Object.hasOwn(coverage, 'capabilities'));
    assert.ok(!raw.includes('"capabilities"'));
  });
});
