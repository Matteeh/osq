/**
 * `traceability.capabilities` config check: every name must have a living
 * capability spec or be declared in `creates` by an active change. These
 * scenarios run `loadConfig` on temporary projects holding an `osq.config.ts`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { unknownCapabilityMessage } from '../src/core/foundation/config-capabilities.js';
import { ConfigLoadError, loadConfig } from '../src/core/foundation/config.js';

const PRICING_SPEC = `# pricing Specification

## Purpose

Pricing capability used by the traceability capability name tests.

## Requirements

### Requirement: Volume pricing
The system SHALL price every unit by quantity.

#### Scenario: Works
- **WHEN** a quote is calculated
- **THEN** the unit price follows the tier
`;

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
});

/** A project with an `osq.config.ts` setting `traceability.capabilities`. */
async function makeProject(capabilities: 'all' | readonly string[]): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-trace-names-'));
  roots.push(root);
  const value = typeof capabilities === 'string' ? "'all'" : JSON.stringify(capabilities);
  await fs.writeFile(
    path.join(root, 'osq.config.ts'),
    `export default { traceability: { capabilities: ${value} } };\n`,
    'utf8',
  );
  return root;
}

async function writeLivingSpec(root: string, capability: string): Promise<void> {
  const dir = path.join(root, 'openspec', 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'spec.md'), PRICING_SPEC, 'utf8');
}

function proposalMarkdown(creates: readonly string[]): string {
  return [
    '---',
    'title: Gadgets',
    'features:',
    '  reads: []',
    'creates:',
    ...creates.map((name) => `  - ${name}`),
    '---',
    '## Goal',
    '',
    'Add gadgets.',
    '',
  ].join('\n');
}

async function writeActiveProposal(
  root: string,
  folder: string,
  creates: readonly string[],
): Promise<void> {
  const dir = path.join(root, 'openspec', 'changes', folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMarkdown(creates), 'utf8');
}

describe('traceability capability names', () => {
  it('accepts a name with a living spec', async () => {
    const root = await makeProject(['pricing']);
    await writeLivingSpec(root, 'pricing');

    const config = await loadConfig(root);

    assert.deepEqual(config.traceability?.capabilities, ['pricing']);
  });

  it('fails a misspelled name with the nearest living name', async () => {
    const root = await makeProject(['pricng']);
    await writeLivingSpec(root, 'pricing');
    const file = path.join(root, 'osq.config.ts');

    await assert.rejects(loadConfig(root), (err: unknown) => {
      assert.ok(err instanceof ConfigLoadError, `not a ConfigLoadError: ${String(err)}`);
      assert.equal(
        err.message,
        `Failed to load ${file}: traceability.capabilities names unknown capability pricng; did you mean pricing?`,
      );
      return true;
    });
  });

  it('accepts a name an active change declares in creates', async () => {
    const root = await makeProject(['gadgets']);
    await writeLivingSpec(root, 'pricing');
    await writeActiveProposal(root, '050-gadgets', ['gadgets']);

    const config = await loadConfig(root);

    assert.deepEqual(config.traceability?.capabilities, ['gadgets']);
  });

  it('ignores creates from an archived change', async () => {
    const root = await makeProject(['gadgets']);
    await writeLivingSpec(root, 'pricing');
    await writeActiveProposal(root, path.join('archive', '001-gadgets'), ['gadgets']);

    await assert.rejects(
      loadConfig(root),
      /traceability\.capabilities names unknown capability gadgets; did you mean pricing\?/,
    );
  });

  it('passes a project with no living capability spec', async () => {
    const root = await makeProject(['pricing']);

    const config = await loadConfig(root);

    assert.deepEqual(config.traceability?.capabilities, ['pricing']);
  });

  it("passes 'all' unchecked", async () => {
    const root = await makeProject('all');
    await writeLivingSpec(root, 'pricing');

    const config = await loadConfig(root);

    assert.equal(config.traceability?.capabilities, 'all');
  });

  it('leaves out the suggestion when no living name exists', () => {
    assert.equal(
      unknownCapabilityMessage('pricing', []),
      'traceability.capabilities names unknown capability pricing',
    );
  });
});
