import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC_DIR = path.resolve(fileURLToPath(new URL('../src', import.meta.url)));

/** Recursively collect every `.ts` file under `dir`. */
async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTsFiles(fullPath)));
    } else if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Extract relative (`./` or `../`) specifiers from static and dynamic imports. */
function relativeSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const staticPattern = /\b(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]/g;
  const dynamicPattern = /(?<![.\w])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const pattern of [staticPattern, dynamicPattern]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

/** The src subdirectory a file belongs to, or `null` for top-level files. */
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
  const files = await listTsFiles(SRC_DIR);
  for (const file of files) {
    const tier = tierOf(file);
    if (!tier) continue;
    const source = await fs.readFile(file, 'utf8');
    for (const specifier of relativeSpecifiers(source)) {
      const resolved = path.resolve(path.dirname(file), specifier);
      const importer = path.relative(SRC_DIR, file);
      if (tier === 'core' && !isInside(resolved, path.join(SRC_DIR, 'core'))) {
        violations.push({ importer, specifier, resolved, rule: 'core stays inside core' });
      }
      if (
        tier === 'harness' &&
        (isInside(resolved, path.join(SRC_DIR, 'watcher')) ||
          isInside(resolved, path.join(SRC_DIR, 'cli')))
      ) {
        violations.push({
          importer,
          specifier,
          resolved,
          rule: 'harness imports neither watcher nor cli',
        });
      }
      if (tier === 'watcher' && isInside(resolved, path.join(SRC_DIR, 'cli'))) {
        violations.push({ importer, specifier, resolved, rule: 'watcher does not import cli' });
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
    const violations = (await findViolations()).filter((v) => v.importer.startsWith('core/'));
    assert.deepEqual(violations, []);
  });

  it('src/harness imports from neither src/watcher nor src/cli', async () => {
    const violations = (await findViolations()).filter((v) => v.importer.startsWith('harness/'));
    assert.deepEqual(violations, []);
  });

  it('src/watcher imports from no module in src/cli', async () => {
    const violations = (await findViolations()).filter((v) => v.importer.startsWith('watcher/'));
    assert.deepEqual(violations, []);
  });

  it('has zero import violations overall', async () => {
    assert.deepEqual(await findViolations(), []);
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
