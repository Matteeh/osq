import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { type LintResult, lintChangeFolder } from '../src/core/spec/linter.js';
import type {
  SystemGraph,
  SystemGraphEdge,
  SystemGraphNode,
} from '../src/core/web/system-graph-types.js';
import { getSystemGraph } from '../src/core/web/system-graph.js';
import { buildAdrPages } from '../src/docs/adr-page.js';
import { installFakeValidator } from './helpers.js';

/**
 * The group-reading half of an ADR: decisions lint, the system graph's
 * `applies_to` edges and the ADR docs page all read `governs`, so a
 * `group:<name>` entry reaches each member, while `appliesTo` stays as
 * written for display.
 */

const roots: string[] = [];
const CHANGE_ID = '001-decisions';
const PROPOSAL_PATH = `openspec/changes/${CHANGE_ID}/proposal.md`;

afterEach(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
});

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-decision-group-readers-'));
  roots.push(root);
  return root;
}

async function write(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** A minimal living capability spec with a Purpose and one requirement. */
function livingSpec(name: string): string {
  return [
    `# ${name} Specification`,
    '',
    '## Purpose',
    `${name} capability purpose.`,
    '',
    '## Requirements',
    '',
    '### Requirement: Billing behavior',
    `${name} SHALL behave.`,
    '',
    '#### Scenario: Behave',
    '- **WHEN** it runs',
    '- **THEN** it behaves',
    '',
  ].join('\n');
}

/** Living pricing and invoices, both in group `sales`, and accepted ADR 005. */
async function groupProject(): Promise<string> {
  const root = await makeRoot();
  for (const capability of ['pricing', 'invoices']) {
    await write(root, `openspec/specs/${capability}/spec.md`, livingSpec(capability));
    await write(root, `openspec/specs/${capability}/osq.yml`, 'group: sales\n');
  }
  await write(
    root,
    'decisions/005-sales.md',
    [
      '---',
      'status: accepted',
      'applies_to: [group:sales]',
      'rule: Sales share one rule.',
      '---',
      '# 005. Sales',
      '',
      'Body.',
      '',
    ].join('\n'),
  );
  return root;
}

function nodeOfKind<K extends SystemGraphNode['kind']>(
  graph: SystemGraph,
  id: string,
  kind: K,
): Extract<SystemGraphNode, { kind: K }> {
  const found = graph.nodes.find((entry) => entry.id === id);
  assert.ok(found, `missing node ${id}`);
  assert.equal(found.kind, kind);
  return found as Extract<SystemGraphNode, { kind: K }>;
}

function edge(graph: SystemGraph, key: string): SystemGraphEdge {
  const found = graph.edges.find((entry) => entry.key === key);
  assert.ok(found, `missing edge ${key}`);
  return found;
}

function findingFor(result: LintResult, message: string): LintResult['findings'][number] {
  const finding = result.findings.find((entry) => entry.message === message);
  assert.ok(
    finding,
    `missing finding "${message}" in:\n${result.findings.map((f) => f.message).join('\n')}`,
  );
  return finding;
}

describe('Group ADR governs a created capability', () => {
  const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

  const TASK = `---
title: When the group decisions probe runs, it passes
verify: node verify.cjs
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes
`;

  const DELTA = `# Spec Delta: Ingress

## ADDED Requirements

### Requirement: Ingress routing

The system SHALL route ingress requests.

#### Scenario: Request routed
- **WHEN** a request arrives
- **THEN** it is routed
`;

  function proposal(decisions: string): string {
    return [
      '---',
      'title: Group Decisions Probe',
      'depends_on: []',
      'verify: node verify.cjs',
      'features:',
      '  reads: []',
      '---',
      '## Goal',
      '',
      'Probe the group decisions declaration.',
      '',
      '## Non-goals',
      '',
      'None.',
      '',
      '## Surface',
      '',
      'None',
      '',
      '## Decisions',
      '',
      decisions,
      '',
      '## Contract',
      '',
      '### Requirement: Probe behavior',
      '',
      'The system SHALL probe deterministically.',
      '',
      '#### Scenario: Probe works',
      '- **WHEN** invoked',
      '- **THEN** it works',
      '',
      '## Delta',
      '',
      'Delta specs declare behavior.',
      '',
    ].join('\n');
  }

  it('fails when a group ADR governs the capability the change creates', async () => {
    const root = await makeRoot();
    await installFakeValidator(root);
    await scaffoldProject(root);
    await write(root, 'verify.cjs', LOCAL_VERIFIER);
    await write(
      root,
      'decisions/009-edge.md',
      [
        '---',
        'status: accepted',
        'applies_to: [group:edge]',
        'rule: Edge capabilities share one rule.',
        '---',
        '# 009. Edge',
        '',
        'Body.',
        '',
      ].join('\n'),
    );
    const folder = path.join(root, 'openspec', 'changes', CHANGE_ID);
    await write(root, `openspec/changes/${CHANGE_ID}/proposal.md`, proposal('None'));
    await write(root, `openspec/changes/${CHANGE_ID}/tasks/1.md`, TASK);
    await write(root, `openspec/changes/${CHANGE_ID}/specs/ingress/spec.md`, DELTA);
    await write(root, `openspec/changes/${CHANGE_ID}/specs/ingress/osq.yml`, 'group: edge\n');

    const result = await lintChangeFolder(root, folder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    const finding = findingFor(
      result,
      'proposal.md ## Decisions does not name ADR 009, which applies to ingress',
    );
    assert.equal(finding.severity, 'error');
    assert.equal(finding.file, PROPOSAL_PATH);
    assert.equal(finding.section, 'Decisions');
  });

  it('passes when the section names the group ADR', async () => {
    const root = await makeRoot();
    await installFakeValidator(root);
    await scaffoldProject(root);
    await write(root, 'verify.cjs', LOCAL_VERIFIER);
    await write(
      root,
      'decisions/009-edge.md',
      [
        '---',
        'status: accepted',
        'applies_to: [group:edge]',
        'rule: Edge capabilities share one rule.',
        '---',
        '# 009. Edge',
        '',
        'Body.',
        '',
      ].join('\n'),
    );
    const folder = path.join(root, 'openspec', 'changes', CHANGE_ID);
    await write(
      root,
      `openspec/changes/${CHANGE_ID}/proposal.md`,
      proposal('- ADR 009: the created capability follows the edge rule.'),
    );
    await write(root, `openspec/changes/${CHANGE_ID}/tasks/1.md`, TASK);
    await write(root, `openspec/changes/${CHANGE_ID}/specs/ingress/spec.md`, DELTA);
    await write(root, `openspec/changes/${CHANGE_ID}/specs/ingress/osq.yml`, 'group: edge\n');

    const result = await lintChangeFolder(root, folder, DEFAULT_CONFIG);

    assert.equal(
      result.findings.some(
        (entry) =>
          entry.severity === 'error' &&
          entry.message.includes('does not name ADR 009, which applies to ingress'),
      ),
      false,
    );
  });
});

describe('Group ADR edges', () => {
  it('gives an applies_to edge to each member and keeps appliesTo as written', async () => {
    const root = await groupProject();

    const graph = await getSystemGraph(root, DEFAULT_CONFIG);

    edge(graph, 'applies_to:adr:005->capability:invoices');
    edge(graph, 'applies_to:adr:005->capability:pricing');
    assert.deepEqual(nodeOfKind(graph, 'adr:005', 'adr').appliesTo, ['group:sales']);
  });
});

describe('ADR page of a group ADR', () => {
  it('keeps appliesTo as written and lists the group members as capabilities', async () => {
    const root = await groupProject();

    const pages = await buildAdrPages(root, DEFAULT_CONFIG);

    const page = pages.find((entry) => entry.number === '005');
    assert.ok(page, `missing ADR page 005 in ${pages.map((entry) => entry.number).join(', ')}`);
    assert.deepEqual(page.appliesTo, ['group:sales']);
    assert.deepEqual(page.capabilities, ['invoices', 'pricing']);
  });
});
