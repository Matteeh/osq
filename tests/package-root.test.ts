import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TEMPLATES_ROOT as INIT_TEMPLATES_ROOT } from '../src/core/foundation/init.js';
import { TEMPLATES_ROOT as NEW_TEMPLATES_ROOT } from '../src/core/foundation/new.js';
import { PACKAGE_ROOT, TEMPLATES_ROOT } from '../src/core/foundation/package-root.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CORE_DIR = path.join(REPO_ROOT, 'src', 'core');

/** Recursively collect every `.ts` file under `dir`. */
async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('single package-root module', () => {
  it('resolves PACKAGE_ROOT to the package that contains package.json', async () => {
    const stat = await fs.stat(path.join(PACKAGE_ROOT, 'package.json'));
    assert.ok(stat.isFile(), `PACKAGE_ROOT ${PACKAGE_ROOT} lacks package.json`);
  });

  it('resolves TEMPLATES_ROOT to the templates directory containing PLANNER.md', async () => {
    const stat = await fs.stat(path.join(TEMPLATES_ROOT, 'PLANNER.md'));
    assert.ok(stat.isFile(), `TEMPLATES_ROOT ${TEMPLATES_ROOT} lacks PLANNER.md`);
  });

  it('keeps the init.ts and new.ts TEMPLATES_ROOT re-exports equal to package-root', () => {
    assert.equal(INIT_TEMPLATES_ROOT, TEMPLATES_ROOT);
    assert.equal(NEW_TEMPLATES_ROOT, TEMPLATES_ROOT);
  });

  it('confines new URL( with import.meta.url to package-root.ts under src/core', async () => {
    const offenders: string[] = [];
    for (const file of await listTsFiles(CORE_DIR)) {
      if (path.basename(file) === 'package-root.ts') continue;
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('new URL(') && source.includes('import.meta.url')) {
        offenders.push(path.relative(REPO_ROOT, file));
      }
    }
    assert.deepEqual(offenders, [], `location-dependent modules: ${offenders.join(', ')}`);
  });
});
