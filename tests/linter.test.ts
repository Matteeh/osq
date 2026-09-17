import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { lintChangeFolder } from '../src/core/linter.js';
import { createNewSpec } from '../src/core/new.js';

describe('Spec Linter', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lint-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Test Feature');
    specFolder = spec.folderPath;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('passes a clean, compliant spec', async () => {
    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('rejects features.writes with more than maxFeatureWrites entries', async () => {
    const specMdPath = path.join(specFolder, 'spec.md');
    const content = `---
title: Over Limit
depends_on: []
features:
  reads: []
  writes: [one, two, three]
---
## Goal
Goal
## Contract
| A | B |
|---|---|
| 1 | 2 |
## Non-goals
None
## Delta
Updated docs.`;
    await fs.writeFile(specMdPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('features.writes')));
  });

  it('rejects more than one table under Contract', async () => {
    const specMdPath = path.join(specFolder, 'spec.md');
    const content = `---
title: Two Tables
depends_on: []
features:
  reads: []
  writes: []
---
## Goal
Goal
## Contract
| A | B |
|---|---|
| 1 | 2 |

| C | D |
|---|---|
| 3 | 4 |
## Non-goals
None
## Delta
None`;
    await fs.writeFile(specMdPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Contract has')));
  });

  it('rejects verify command that chains commands', async () => {
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const content = `---
title: When condition, action
verify: pnpm test && pnpm lint
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes cleanly`;
    await fs.writeFile(taskPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('chains commands')));
  });

  it('rejects depends_on naming a missing change', async () => {
    const specMdPath = path.join(specFolder, 'spec.md');
    const content = `---
title: Bad Dependency
depends_on: [999]
features:
  reads: []
  writes: []
---
## Goal
Goal
## Contract
| A | B |
|---|---|
| 1 | 2 |
## Non-goals
None
## Delta
None`;
    await fs.writeFile(specMdPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('missing change: 999')));
  });

  it('rejects acceptance checklist longer than maxAcceptanceLines', async () => {
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const items = Array.from({ length: 8 }, (_, i) => `- [ ] item ${i + 1}`).join('\n');
    const content = `---
title: Too many acceptance lines
verify: pnpm test
scope: []
entry: []
skills: []
---
## Acceptance
${items}`;
    await fs.writeFile(taskPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('acceptance lines')));
  });

  it('rejects empty Delta when features.writes is non-empty', async () => {
    const specMdPath = path.join(specFolder, 'spec.md');
    const content = `---
title: Missing Delta
depends_on: []
features:
  reads: []
  writes: [feature-a]
---
## Goal
Goal
## Contract
| A | B |
|---|---|
| 1 | 2 |
## Non-goals
None
## Delta
`;
    await fs.writeFile(specMdPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Delta is empty')));
  });

  it('warns when task title contains " and "', async () => {
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const content = `---
title: When order is cancelled and refund issued
verify: pnpm test
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes cleanly`;
    await fs.writeFile(taskPath, content);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes('contains " and "')));
  });
});
