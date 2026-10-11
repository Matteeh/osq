/**
 * The docs fixture every docs task shares: the `fixture/trace/pricing` project
 * copied to a temporary directory and given the capabilities, ADRs, and
 * archived changes the `docs` scenarios describe. Tasks 2 to 5 import this
 * file and never edit it.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PRICING_FIXTURE = path.join(PROJECT_ROOT, 'fixture', 'trace', 'pricing');

/** The globs `pricing` owns in the docs fixture. */
export const PRICING_GLOBS = ['src/pricing/**', 'tests/pricing-*.test.ts'] as const;

/** The roots `docsProject` created and `cleanupDocsProjects` removes. */
const roots: string[] = [];

/** Write `content` at `relative` under `root`, creating parent folders. */
async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** The `osq.config.ts` every docs fixture carries. */
const DOCS_CONFIG = `export default {
  harness: 'mock',
  traceability: { capabilities: ['pricing'], mode: 'warn' },
};
`;

/** Append pricing's Code ownership requirement to the copied living spec. */
async function addPricingOwnership(root: string): Promise<void> {
  const specPath = path.join(root, 'openspec', 'specs', 'pricing', 'spec.md');
  const content = await fs.readFile(specPath, 'utf8');
  const block = [
    '### Requirement: Code ownership',
    `<!-- source: ${PRICING_GLOBS.join(', ')} -->`,
    'The pricing capability SHALL own its files.',
    '',
    '#### Scenario: Pricing ownership',
    '- **WHEN** file ownership is resolved for pricing files',
    `- **THEN** system maps \`${PRICING_GLOBS[0]}\` and \`${PRICING_GLOBS[1]}\` to pricing`,
    '',
  ].join('\n');
  await writeAt(root, 'openspec/specs/pricing/spec.md', `${content.trimEnd()}\n\n${block}`);
}

/** The ungrouped `invoices` capability. */
const INVOICES_SPEC = `# invoices Specification

## Purpose
Issues invoices for accepted quotes.

## Requirements
### Requirement: Invoice numbers
Each invoice gets a number. The system SHALL number invoices without gaps. Numbers never repeat.

#### Scenario: Numbers are gapless
- **WHEN** invoices are issued
- **THEN** the numbers have no gaps

### Requirement: Code ownership
<!-- source: src/invoices/** -->
The invoices capability SHALL own its files.

#### Scenario: Invoice ownership
- **WHEN** file ownership is resolved for invoice files
- **THEN** system maps \`src/invoices/**\` to invoices
`;

/** One ADR file's content: frontmatter plus a small body. */
function adrFile(input: {
  readonly number: string;
  readonly title: string;
  readonly status: string;
  readonly appliesTo: string;
  readonly rule: string;
  readonly date: string;
  readonly supersededBy?: string;
}): string {
  const lines = [
    '---',
    `status: ${input.status}`,
    `applies_to: ${input.appliesTo}`,
    `rule: ${input.rule}`,
  ];
  if (input.supersededBy !== undefined) lines.push(`superseded_by: "${input.supersededBy}"`);
  lines.push(
    '---',
    `# ${input.number}. ${input.title}`,
    '',
    `Date: ${input.date}`,
    '',
    '## Decision',
    '',
    input.rule,
    '',
  );
  return lines.join('\n');
}

/** One archived change: a proposal, one delta, and an `archived` event. */
function archivedChange(
  n: number,
  capability: string,
): {
  folder: string;
  proposal: string;
  delta: string;
  event: string;
} {
  const id = String(n).padStart(3, '0');
  const day = String(n).padStart(2, '0');
  return {
    folder: `${id}-change-${n}`,
    proposal: `---\ntitle: Change ${n}\n---\n## Goal\n\nChange ${n} goal. More text.\n`,
    delta: `# Spec Delta: ${capability}\n\n## ADDED Requirements\n\n### Requirement: Change ${n} requirement\n\nChange ${n} requirement text.\n\n#### Scenario: Change ${n} works\n- **WHEN** change ${n} runs\n- **THEN** change ${n} is applied\n`,
    event: `${JSON.stringify({
      type: 'archived',
      timestamp: `2026-10-${day}T09:00:00.000Z`,
      data: {},
    })}\n`,
  };
}

/** Add the two capabilities, the four ADRs, and the eight archived changes. */
async function addFixtureContent(root: string): Promise<void> {
  await writeAt(root, 'osq.config.ts', DOCS_CONFIG);
  await addPricingOwnership(root);
  await writeAt(root, 'openspec/specs/pricing/osq.yml', 'group: billing\n');
  await writeAt(root, 'openspec/specs/invoices/spec.md', INVOICES_SPEC);
  await writeAt(
    root,
    'decisions/002-log-every-amount.md',
    adrFile({
      number: '002',
      title: 'Log Every Amount',
      status: 'accepted',
      appliesTo: 'all',
      rule: 'Every amount is logged.',
      date: '2026-09-21',
    }),
  );
  await writeAt(
    root,
    'decisions/003-yearly-invoice-numbers.md',
    adrFile({
      number: '003',
      title: 'Yearly Invoice Numbers',
      status: 'superseded',
      appliesTo: '[invoices]',
      rule: 'Invoice numbers restart every year.',
      date: '2026-09-22',
      supersededBy: '004',
    }),
  );
  await writeAt(
    root,
    'decisions/004-gapless-invoice-numbers.md',
    adrFile({
      number: '004',
      title: 'Gapless Invoice Numbers',
      status: 'accepted',
      appliesTo: '[invoices]',
      rule: 'Invoice numbers never repeat.',
      date: '2026-09-23',
    }),
  );

  for (let n = 1; n <= 8; n += 1) {
    const change = archivedChange(n, n <= 7 ? 'pricing' : 'invoices');
    const base = path.posix.join('openspec', 'changes', 'archive', change.folder);
    await writeAt(root, path.posix.join(base, 'proposal.md'), change.proposal);
    await writeAt(
      root,
      path.posix.join(base, 'specs', n <= 7 ? 'pricing' : 'invoices', 'spec.md'),
      change.delta,
    );
    await writeAt(root, path.posix.join(base, '.run', 'events', 'change.jsonl'), change.event);
  }
}

/**
 * Copy the pricing fixture to a temporary project and add the docs fixture.
 *
 * @scenario docs: Pages of the docs fixture
 * @scenario docs: ADR pages of the docs fixture
 * @scenario docs: Groups of the docs fixture
 * @adr 016
 */
export async function docsProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-docs-'));
  roots.push(root);
  await fs.cp(PRICING_FIXTURE, root, { recursive: true });
  await addFixtureContent(root);
  return root;
}

/** Remove one `docsProject` root. */
export async function cleanupDocsProject(root: string): Promise<void> {
  const index = roots.indexOf(root);
  if (index >= 0) roots.splice(index, 1);
  await fs.rm(root, { recursive: true, force: true });
}

/** Remove every `docsProject` root, for a suite's `afterEach`. */
export async function cleanupDocsProjects(): Promise<void> {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
}
