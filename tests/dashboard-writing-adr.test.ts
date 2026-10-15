import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { readDecisions, validateDecisions } from '../src/core/foundation/decisions.js';
import { checkProjectRules, renderRulesBlock } from '../src/core/foundation/rules-block.js';
import { readLivingCapabilityNames } from '../src/core/spec/digest-capability.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RULE =
  'The dashboard renders server documents; logic sits in pure model files, components only render, shared state uses React context, and no state library is added.';

const CHECKS = ['tests/dashboard-writing-adr.test.ts'];

const DENIES = [
  'zustand',
  'redux',
  '@reduxjs/toolkit',
  'react-redux',
  'mobx',
  'mobx-react-lite',
  'jotai',
  'recoil',
  'valtio',
  'xstate',
  '@xstate/react',
  '@tanstack/react-query',
  'swr',
  'react-router',
  'react-router-dom',
];

/** The tokens a screen file must not contain, in the order the requirement lists them. */
const FORBIDDEN_TOKENS = [
  'EventSource',
  'addEventListener',
  'setInterval',
  'setTimeout',
  'AbortSignal.timeout',
  'fetch(',
  'dangerouslySetInnerHTML',
  'markdown',
];

/** The one file allowed to keep one banned token until a change moves it out. */
const EXCEPTIONS = [{ file: 'change/ChangeView.tsx', token: 'AbortSignal.timeout' }];

interface ScreenException {
  readonly file: string;
  readonly token: string;
}

/**
 * Scans every folder directly under `srcRoot`, which is a screen folder, and
 * returns the report lines of "Dashboard screen sources", sorted by path. Files
 * directly under `srcRoot` are not scanned, and a folder inside a screen folder
 * is a report line rather than a crash.
 */
async function scanScreenSources(
  srcRoot: string,
  exceptions: readonly ScreenException[],
): Promise<string[]> {
  const reports: string[] = [];
  const used = new Set<string>();
  const entries = await fs.readdir(srcRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const screenDir = path.join(srcRoot, entry.name);
    const items = await fs.readdir(screenDir, { withFileTypes: true });
    for (const item of items) {
      const relative = `${entry.name}/${item.name}`;
      if (item.isDirectory()) {
        reports.push(`${relative} is a folder inside a screen folder`);
        continue;
      }
      if (!item.isFile()) continue;
      const source = await fs.readFile(path.join(screenDir, item.name), 'utf8');
      for (const token of FORBIDDEN_TOKENS) {
        if (!source.includes(token)) continue;
        if (exceptions.some((entry2) => entry2.file === relative && entry2.token === token)) {
          used.add(`${relative}\t${token}`);
          continue;
        }
        reports.push(`${relative} must not contain ${token}`);
      }
    }
  }
  for (const exception of exceptions) {
    if (!used.has(`${exception.file}\t${exception.token}`)) {
      reports.push(
        `${exception.file}: ${exception.token} is on the exception list but no longer appears`,
      );
    }
  }
  reports.sort();
  return reports;
}

/** Returns `<name> is denied by ADR 020` for each denied package in a manifest. */
function deniedPackages(manifest: unknown, denies: readonly string[]): string[] {
  const denied = new Set(denies);
  const found = new Set<string>();
  if (manifest !== null && typeof manifest === 'object') {
    for (const field of ['dependencies', 'devDependencies']) {
      const deps = (manifest as Record<string, unknown>)[field];
      if (deps === null || typeof deps !== 'object' || Array.isArray(deps)) continue;
      for (const name of Object.keys(deps)) {
        if (denied.has(name)) found.add(name);
      }
    }
  }
  return [...found].sort().map((name) => `${name} is denied by ADR 020`);
}

/** Writes one screen file under a fresh temporary `src` folder and scans it. */
async function scanOneScreen(
  file: string,
  content: string,
  exceptions: readonly ScreenException[],
): Promise<string[]> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dashboard-screen-'));
  try {
    const target = path.join(root, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
    return await scanScreenSources(root, exceptions);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

describe('ADR 020: the dashboard writing decision is accepted', () => {
  it('is accepted for web-inspection and reports no problem', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    const adr = records.adrs.find((entry) => entry.number === '020');

    assert.ok(adr, 'ADR 020 must be read');
    assert.equal(records.ignored.includes(adr.path), false, 'ADR 020 must not be ignored');
    assert.equal(adr.status, 'accepted');
    assert.deepEqual(adr.appliesTo, ['web-inspection']);
    assert.equal(adr.rule, RULE);
    assert.deepEqual([...adr.checks], CHECKS);
    assert.deepEqual([...adr.denies], DENIES);

    const problems = validateDecisions(records, living, DEFAULT_CONFIG);
    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);
  });

  it('keeps the project rules block unchanged', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const block = renderRulesBlock(records);
    assert.ok(block, 'the rules block must render');
    const lines = block.split('\n');
    assert.equal(
      lines.some((line) => line.endsWith('ADR 020')),
      false,
      'ADR 020 does not apply to all, so the rules block must not name it',
    );
    assert.deepEqual(await checkProjectRules(repoRoot, DEFAULT_CONFIG), []);
  });

  it('is linked exactly once from the decisions index', async () => {
    const readme = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, 'README.md'),
      'utf8',
    );
    const links = readme.match(/020-dashboard-writing\.md/g) ?? [];
    assert.equal(links.length, 1, 'the index must link 020-dashboard-writing.md exactly once');
  });
});

describe('dashboard screen sources', () => {
  const rows: Array<{
    file: string;
    content: string;
    exceptions: ScreenException[];
    report: string[];
  }> = [
    {
      file: 'home/Clock.tsx',
      content: 'setInterval(tick, 1000);',
      exceptions: [],
      report: ['home/Clock.tsx must not contain setInterval'],
    },
    {
      file: 'report/Load.ts',
      content: "fetch('/x');",
      exceptions: [],
      report: ['report/Load.ts must not contain fetch('],
    },
    {
      file: 'change/ChangeView.tsx',
      content: 'AbortSignal.timeout(1);',
      exceptions: EXCEPTIONS,
      report: [],
    },
    {
      file: 'change/ChangeView.tsx',
      content: 'export const x = 1;',
      exceptions: EXCEPTIONS,
      report: [
        'change/ChangeView.tsx: AbortSignal.timeout is on the exception list but no longer appears',
      ],
    },
    {
      file: 'home/View.tsx',
      content: 'export const x = 1;',
      exceptions: EXCEPTIONS,
      report: [
        'change/ChangeView.tsx: AbortSignal.timeout is on the exception list but no longer appears',
      ],
    },
    {
      file: 'home/parts/Row.tsx',
      content: 'export const x = 1;',
      exceptions: [],
      report: ['home/parts is a folder inside a screen folder'],
    },
    {
      file: 'data.ts',
      content: "fetch('/x');",
      exceptions: [],
      report: [],
    },
  ];

  it('reports exactly the problems of each screen file row', async () => {
    for (const row of rows) {
      assert.deepEqual(
        await scanOneScreen(row.file, row.content, row.exceptions),
        row.report,
        row.file,
      );
    }
  });
});

describe('dashboard UI manifest', () => {
  const rows: Array<{ manifest: unknown; report: string[] }> = [
    {
      manifest: { devDependencies: { react: '19.3.0', zustand: '5.0.0' } },
      report: ['zustand is denied by ADR 020'],
    },
    {
      manifest: { dependencies: { swr: '2.0.0' } },
      report: ['swr is denied by ADR 020'],
    },
    {
      manifest: { devDependencies: { react: '19.3.0', vite: '8.3.0' } },
      report: [],
    },
  ];

  it('reports exactly the denied packages of each manifest row', () => {
    for (const row of rows) {
      assert.deepEqual(deniedPackages(row.manifest, DENIES), row.report);
    }
  });
});

describe('the dashboard keeps to ADR 020', () => {
  it('reports nothing for the repository screens and UI manifest', async () => {
    const srcRoot = path.join(repoRoot, 'packages', 'ui', 'src');
    assert.deepEqual(await scanScreenSources(srcRoot, EXCEPTIONS), []);

    const manifest = JSON.parse(
      await fs.readFile(path.join(repoRoot, 'packages', 'ui', 'package.json'), 'utf8'),
    );
    assert.deepEqual(deniedPackages(manifest, DENIES), []);
  });
});
