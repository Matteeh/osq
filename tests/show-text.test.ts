import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  formatShowOutput as textFormatShowOutput,
  formatSpecDetails as textFormatSpecDetails,
} from '../src/core/status/show-text.js';
import type { SpecDetails } from '../src/core/status/show-types.js';
import { formatShowOutput, formatSpecDetails } from '../src/core/status/show.js';

const STATUS_DIR = path.join(process.cwd(), 'src', 'core', 'status');

/** Every renderer module: `show-text.ts` and each `show-*-lines.ts`. */
async function rendererFiles(): Promise<string[]> {
  const entries = await fs.readdir(STATUS_DIR);
  return entries
    .filter((name) => name === 'show-text.ts' || /^show-.*-lines\.ts$/.test(name))
    .sort();
}

/** All module specifiers imported by `source`, in source order. */
function importedSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /from\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

describe('show text renderers', () => {
  it('discovers the renderer modules', async () => {
    const files = await rendererFiles();
    assert.ok(files.includes('show-text.ts'));
    assert.ok(files.includes('show-task-lines.ts'));
    assert.ok(files.includes('show-run-lines.ts'));
  });

  it('reads no files and imports only show-types and each other', async () => {
    const files = await rendererFiles();
    const allowedShowImports = new Set([
      './show-types.js',
      ...files.map((file) => `./${file.replace(/\.ts$/, '.js')}`),
    ]);

    for (const file of files) {
      const source = await fs.readFile(path.join(STATUS_DIR, file), 'utf8');
      assert.doesNotMatch(source, /node:fs/, `${file} imports node:fs`);
      for (const specifier of importedSpecifiers(source)) {
        if (!specifier.startsWith('./show')) continue;
        assert.ok(
          allowedShowImports.has(specifier),
          `${file} imports disallowed show module ${specifier}`,
        );
      }
    }
  });

  it('re-exports the text renderer functions from show.js', () => {
    assert.equal(formatSpecDetails, textFormatSpecDetails);
    assert.equal(formatShowOutput, textFormatShowOutput);
  });

  it('renders empty sections from a hand-built model', () => {
    const details: SpecDetails = {
      id: '1',
      folderName: '001-demo',
      folderPath: '/tmp/001-demo',
      isArchived: false,
      location: 'active',
      title: 'Demo',
      status: 'unapproved',
      approvedHash: null,
      dependsOn: [],
      features: { reads: [], writes: [] },
      goal: '',
      contract: '',
      nonGoals: '',
      delta: '',
      tasks: [],
      planningSessions: [],
      recertifications: [],
      timeline: [],
    };

    const text = formatSpecDetails(details);
    assert.ok(text.includes('  (no tasks)'), 'missing empty task list');
    assert.ok(text.includes('  (no planning sessions)'), 'missing empty planning sessions');
    assert.ok(text.includes('  (no events recorded)'), 'missing empty event timeline');
  });
});
