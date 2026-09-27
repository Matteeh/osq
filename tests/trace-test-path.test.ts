import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { ownedFunctions, unclaimedFunctionsFor } from '../src/core/report/report-traceability.js';
import type { CapabilityOwnership } from '../src/core/spec/capability-impact.js';
import { buildImportGraph } from '../src/core/spec/import-graph.js';
import { buildScenarioIndex } from '../src/core/trace/scenario-index.js';
import { isTestPath } from '../src/core/trace/test-path.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-test-path-'));
  tmpDirs.push(root);
  return root;
}

async function writeFile(root: string, relative: string, content: string): Promise<void> {
  const full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

describe('test paths', () => {
  it('tells test paths from source paths', () => {
    assert.equal(isTestPath('tests/pricing.ts'), true);
    assert.equal(isTestPath('src/pricing/quote.test.ts'), true);
    assert.equal(isTestPath('src/pricing/quote.spec.ts'), true);
    assert.equal(isTestPath('src/pricing/quote.ts'), false);
  });

  it('has one definition, imported by lint and the report', async () => {
    const sources = [
      'src/core/spec/traceability-lint.ts',
      'src/core/report/report-traceability.ts',
    ];
    for (const relative of sources) {
      const source = await fs.readFile(path.join(process.cwd(), relative), 'utf8');
      assert.equal(
        /\b(?:function\s+isTestPath|const\s+isTestPath)\b/.test(source),
        false,
        `${relative} defines its own isTestPath`,
      );
      assert.match(
        source,
        /import\s*\{[^}]*\bisTestPath\b[^}]*\}\s*from\s*['"]\.\.\/trace\/test-path\.js['"]/,
        `${relative} must import isTestPath`,
      );
    }
  });
});

describe('owned functions', () => {
  it('keeps a tagged function that unclaimedFunctionsFor leaves out', async () => {
    const root = await tempRoot();
    await writeFile(
      root,
      'src/pricing/quote.ts',
      '/**\n * @scenario pricing: Volume discount tiers\n */\nexport function quote(): number {\n  return 1;\n}\n\nexport function tierPrice(): number {\n  return 2;\n}\n',
    );
    await writeFile(
      root,
      'src/pricing/quote.test.ts',
      'export function inTestPath(): number {\n  return 3;\n}\n',
    );
    await writeFile(
      root,
      'src/pricing/probe.ts',
      `import { scenario } from '@matteeh/osq/testing';\n\nexport function inScenarioFile(): number {\n  return 4;\n}\n`,
    );

    const graph = await buildImportGraph(root, { skip: ['openspec'] });
    const index = buildScenarioIndex(root, graph);
    const ownerships: CapabilityOwnership[] = [
      { capability: 'pricing', globs: ['src/pricing/**'] },
    ];

    const owned = ownedFunctions('pricing', index, ownerships);
    assert.deepEqual(
      owned.map((fn) => fn.name),
      ['quote', 'tierPrice'],
    );
    assert.ok(owned.some((fn) => fn.name === 'quote' && fn.scenarios.length > 0));

    assert.deepEqual(unclaimedFunctionsFor('pricing', index, ownerships), [
      { file: 'src/pricing/quote.ts', name: 'tierPrice' },
    ]);
  });
});
