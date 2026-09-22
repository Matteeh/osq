import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC_DIR = path.join(REPO, 'src');
const UI_DIR = path.join(REPO, 'packages', 'ui');

/** Recursively collect every source file whose path ends with one of `exts`. */
async function listSourceFiles(dir: string, exts: readonly string[]): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(fullPath, exts)));
    } else if (entry.isFile() && exts.some((ext) => fullPath.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

/** True when the clause after `import`/`export` carries only type bindings. */
function isTypeOnlyClause(clause: string): boolean {
  const trimmed = clause.trim();
  if (/^type\b/.test(trimmed)) return true;
  const braces = /^\{([\s\S]*)\}$/.exec(trimmed);
  if (braces === null) return false;
  const parts = (braces[1] ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => /^type\s/.test(part));
}

interface ImportRecord {
  readonly specifier: string;
  readonly typeOnly: boolean;
}

/** Extract static, side-effect, and dynamic imports, marking type-only ones. */
function collectImports(source: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const clauses = /\b(import|export)\b([^'";]*?)from\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(clauses)) {
    records.push({ specifier: match[3] ?? '', typeOnly: isTypeOnlyClause(match[2] ?? '') });
  }
  for (const match of source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) {
    records.push({ specifier: match[1] ?? '', typeOnly: false });
  }
  for (const match of source.matchAll(/(?<![.\w])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    records.push({ specifier: match[1] ?? '', typeOnly: false });
  }
  return records;
}

function tierOf(file: string): 'core' | 'harness' | 'watcher' | 'cli' | null {
  const relative = path.relative(SRC_DIR, file).split(path.sep);
  const tier = relative[0];
  if (tier === 'core' || tier === 'harness' || tier === 'watcher' || tier === 'cli') {
    return tier;
  }
  return null;
}

function isInside(target: string, dir: string): boolean {
  const relative = path.relative(dir, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

interface Violation {
  importer: string;
  specifier: string;
  resolved: string;
  rule: string;
}

/** Apply the directional import rules and return every violation found. */
async function findViolations(): Promise<Violation[]> {
  const violations: Violation[] = [];
  const srcFiles = await listSourceFiles(SRC_DIR, ['.ts']);
  const uiFiles = await listSourceFiles(path.join(UI_DIR, 'src'), ['.ts', '.tsx']);
  for (const file of [...srcFiles, ...uiFiles]) {
    const tier = tierOf(file);
    const source = await fs.readFile(file, 'utf8');
    for (const record of collectImports(source)) {
      if (!record.specifier.startsWith('./') && !record.specifier.startsWith('../')) continue;
      const resolved = path.resolve(path.dirname(file), record.specifier);
      const importer = path.relative(REPO, file);
      if (tier === 'core' && !isInside(resolved, path.join(SRC_DIR, 'core'))) {
        violations.push({
          importer,
          specifier: record.specifier,
          resolved,
          rule: 'core stays inside core',
        });
      }
      if (
        tier === 'harness' &&
        (isInside(resolved, path.join(SRC_DIR, 'watcher')) ||
          isInside(resolved, path.join(SRC_DIR, 'cli')))
      ) {
        violations.push({
          importer,
          specifier: record.specifier,
          resolved,
          rule: 'harness imports neither watcher nor cli',
        });
      }
      if (tier === 'watcher' && isInside(resolved, path.join(SRC_DIR, 'cli'))) {
        violations.push({
          importer,
          specifier: record.specifier,
          resolved,
          rule: 'watcher does not import cli',
        });
      }
      if (isInside(file, UI_DIR) && isInside(resolved, SRC_DIR) && !record.typeOnly) {
        violations.push({
          importer,
          specifier: record.specifier,
          resolved,
          rule: 'UI imports src as a runtime value',
        });
      }
      if (isInside(file, SRC_DIR) && isInside(resolved, UI_DIR)) {
        violations.push({
          importer,
          specifier: record.specifier,
          resolved,
          rule: 'src imports packages/ui',
        });
      }
    }
  }
  return violations;
}

/** Pure boundary analysis over explicit file/source pairs. */
function analyzeBoundaries(entries: readonly { file: string; source: string }[]): Violation[] {
  const violations: Violation[] = [];
  for (const { file, source } of entries) {
    const inSrc = isInside(file, SRC_DIR);
    const inUi = isInside(file, UI_DIR);
    if (!inSrc && !inUi) continue;
    const importer = path.relative(REPO, file);
    for (const record of collectImports(source)) {
      if (!record.specifier.startsWith('./') && !record.specifier.startsWith('../')) continue;
      const resolved = path.resolve(path.dirname(file), record.specifier);
      if (inUi && isInside(resolved, SRC_DIR) && !record.typeOnly) {
        violations.push({
          importer,
          specifier: record.specifier,
          resolved,
          rule: 'UI imports src as a runtime value',
        });
      }
      if (inSrc && isInside(resolved, UI_DIR)) {
        violations.push({
          importer,
          specifier: record.specifier,
          resolved,
          rule: 'src imports packages/ui',
        });
      }
    }
  }
  return violations;
}

describe('import graph boundaries', () => {
  it('WatchCommandOptions is declared in src/watcher/dev.ts', async () => {
    const dev = await fs.readFile(path.join(SRC_DIR, 'watcher', 'dev.ts'), 'utf8');
    assert.match(dev, /export interface WatchCommandOptions\b/);
    assert.doesNotMatch(dev, /from\s*['"]\.\.\/cli\//);
  });

  it('src/cli/watch.ts imports WatchCommandOptions from src/watcher/dev.ts', async () => {
    const watch = await fs.readFile(path.join(SRC_DIR, 'cli', 'watch.ts'), 'utf8');
    assert.match(
      watch,
      /import\s+type\s*\{[^}]*WatchCommandOptions[^}]*\}\s*from\s*['"]\.\.\/watcher\/dev\.js['"]/,
    );
  });

  it('src/core imports only from src/core', async () => {
    const violations = (await findViolations()).filter((v) => v.importer.startsWith('src/core/'));
    assert.deepEqual(violations, []);
  });

  it('src/harness imports from neither src/watcher nor src/cli', async () => {
    const violations = (await findViolations()).filter((v) =>
      v.importer.startsWith('src/harness/'),
    );
    assert.deepEqual(violations, []);
  });

  it('src/watcher imports from no module in src/cli', async () => {
    const violations = (await findViolations()).filter((v) =>
      v.importer.startsWith('src/watcher/'),
    );
    assert.deepEqual(violations, []);
  });

  it('keeps UI runtime imports out of core and core imports out of UI', async () => {
    assert.deepEqual(await findViolations(), []);
  });

  it('rejects a runtime UI import from src', () => {
    const violations = analyzeBoundaries([
      {
        file: path.join(UI_DIR, 'src', 'bad.ts'),
        source: "import { getWebGraph } from '../../../src/core/web-data.js';",
      },
    ]);
    assert.equal(violations.length, 1);
    assert.match(violations[0]?.rule ?? '', /runtime value/);
  });

  it('allows erased type-only UI imports from src', () => {
    const violations = analyzeBoundaries([
      {
        file: path.join(UI_DIR, 'src', 'good.ts'),
        source: "import type { WebGraph } from '../../../src/core/web-data.js';",
      },
      {
        file: path.join(UI_DIR, 'src', 'also-good.ts'),
        source: "export type { WebGraph } from '../../../src/core/web-data.js';",
      },
    ]);
    assert.deepEqual(violations, []);
  });

  it('rejects any src import from packages/ui', () => {
    const violations = analyzeBoundaries([
      {
        file: path.join(SRC_DIR, 'core', 'bad.ts'),
        source: "import { App } from '../../packages/ui/src/app.js';",
      },
    ]);
    assert.equal(violations.length, 1);
    assert.match(violations[0]?.rule ?? '', /packages\/ui/);
  });

  it('keeps fetch and EventSource inside the data module', async () => {
    const files = await listSourceFiles(path.join(UI_DIR, 'src'), ['.ts', '.tsx']);
    const offenders: string[] = [];
    for (const file of files) {
      const basename = path.basename(file);
      if (basename === 'data.ts') continue;
      const source = await fs.readFile(file, 'utf8');
      if (/\bfetch\s*\(/.test(source) || /EventSource/.test(source)) {
        offenders.push(path.relative(REPO, file));
      }
    }
    assert.deepEqual(offenders, []);
  });
});

describe('runner lifecycle module line budget', () => {
  const LIFECYCLE_MODULES = [
    'lock.ts',
    'spawn.ts',
    'heartbeat.ts',
    'verify.ts',
    'outcome.ts',
    'runner.ts',
  ];

  it('keeps every runner lifecycle module strictly under 200 lines', async () => {
    for (const file of LIFECYCLE_MODULES) {
      const source = await fs.readFile(path.join(SRC_DIR, 'watcher', file), 'utf8');
      const lineCount = source.replace(/\n$/, '').split('\n').length;
      assert.ok(lineCount < 200, `src/watcher/${file} has ${lineCount} lines; budget is < 200`);
    }
  });
});
