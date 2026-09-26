import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildOpeningPrompt } from '../src/cli/plan.js';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/foundation/config.js';

const SENTENCE =
  "Read in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-decisions-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const target = path.join(tmpDir, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function adrFile(frontmatter: string, heading: string): string {
  return `---\n${frontmatter}\n---\n# ${heading}\n`;
}

async function openingPrompt(config: OsqConfig = DEFAULT_CONFIG): Promise<string> {
  return await buildOpeningPrompt({
    projectRoot: tmpDir,
    folderPath: path.join(tmpDir, 'openspec', 'changes', '001-probe'),
    specId: '001',
    specTitle: 'Probe',
    briefContent: '# Probe\n',
    openspecRoot: 'openspec',
    config,
    recordBody: 'record body',
  });
}

describe('plan prompt architecture decisions', () => {
  it('lists accepted ADRs in number order with scope, rule, and path', async () => {
    await write(
      'decisions/003-old-ui.md',
      adrFile(
        'status: superseded\napplies_to: all\nrule: Old UI rule.\nsuperseded_by: 009',
        '003. Old UI',
      ),
    );
    await write(
      'decisions/007-ui-framework.md',
      adrFile(
        'status: accepted\napplies_to: [ingress, billing]\nrule: UI components use React.',
        '007. UI framework',
      ),
    );
    await write(
      'decisions/009-ingress.md',
      adrFile(
        'status: accepted\napplies_to: all\nrule: One adapter serves ingress.',
        '009. Ingress adapter',
      ),
    );

    const prompt = await openingPrompt();

    const specsIdx = prompt.indexOf('## Capability Specs');
    const headingIdx = prompt.indexOf('## Architecture Decisions');
    const briefIdx = prompt.indexOf('## Brief');
    assert.ok(specsIdx !== -1, 'capability specs heading present');
    assert.ok(headingIdx !== -1, 'architecture decisions heading present');
    assert.ok(briefIdx !== -1, 'brief heading present');
    assert.ok(specsIdx < headingIdx, 'decisions after capability specs');
    assert.ok(headingIdx < briefIdx, 'decisions before brief');
    assert.ok(prompt.includes(SENTENCE), 'section opens with the required sentence');
    assert.ok(
      prompt.includes(
        '- ADR 007: UI framework. Applies to: ingress, billing. Rule: UI components use React. Path: decisions/007-ui-framework.md',
      ),
    );
    assert.ok(
      prompt.includes(
        '- ADR 009: Ingress adapter. Applies to: all. Rule: One adapter serves ingress. Path: decisions/009-ingress.md',
      ),
    );
    assert.ok(prompt.indexOf('- ADR 007:') < prompt.indexOf('- ADR 009:'), 'number order');
    assert.equal(prompt.includes('ADR 003'), false, 'superseded ADR is absent');
    assert.equal(prompt.includes('Old UI rule.'), false);
  });

  it('omits the section when every ADR is still proposed', async () => {
    await write(
      'decisions/007-ui-framework.md',
      adrFile(
        'status: proposed\napplies_to: all\nrule: UI components use React.',
        '007. UI framework',
      ),
    );

    const prompt = await openingPrompt();

    assert.equal(prompt.includes('## Architecture Decisions'), false);
    assert.equal(prompt.includes('ADR 007'), false);
    assert.ok(prompt.includes('## Capability Specs'));
    assert.ok(prompt.includes('## Brief'));
  });

  it('omits the section when the decisions folder is missing', async () => {
    const prompt = await openingPrompt();
    assert.equal(prompt.includes('## Architecture Decisions'), false);
  });

  it('reads the configured decisions folder', async () => {
    const config = defineConfig({ paths: { decisions: 'docs/adr' } });
    await write(
      'docs/adr/007-ui-framework.md',
      adrFile(
        'status: accepted\napplies_to: all\nrule: UI components use React.',
        '007. UI framework',
      ),
    );
    await write(
      'decisions/009-ignored.md',
      adrFile('status: accepted\napplies_to: all\nrule: Should not appear.', '009. Ignored'),
    );

    const prompt = await openingPrompt(config);

    assert.ok(
      prompt.includes(
        '- ADR 007: UI framework. Applies to: all. Rule: UI components use React. Path: docs/adr/007-ui-framework.md',
      ),
    );
    assert.equal(prompt.includes('ADR 009'), false);
  });
});
