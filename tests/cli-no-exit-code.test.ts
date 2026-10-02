import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI_DIR = path.join(ROOT, 'src', 'cli');

/** `run.ts` is the one file allowed to turn a `CommandError` into an exit code. */
const ALLOWED = new Set([path.join(CLI_DIR, 'run.ts')]);

/** A direct assignment to the global exit code. */
const EXIT_CODE_ASSIGNMENT = /\bprocess\.exitCode\s*=/;
/** An injectable command option named `exit`, e.g. `exit?: (code: number) => void`. */
const EXIT_OPTION = /\bexit\s*\??\s*:/;

/**
 * Blank every `//` and block comment out of `source`, preserving newlines so
 * reported line numbers still point at the original file.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}

/** One rule `source` breaks, with the line that matched. */
interface Violation {
  readonly rule: 'process.exitCode' | 'exit option';
  readonly line: number;
}

/** Every rule a source text breaks, one entry per matched rule and line. */
function findViolations(source: string): Violation[] {
  const violations: Violation[] = [];
  stripComments(source)
    .split('\n')
    .forEach((line, index) => {
      if (EXIT_CODE_ASSIGNMENT.test(line)) {
        violations.push({ rule: 'process.exitCode', line: index + 1 });
      }
      if (EXIT_OPTION.test(line)) {
        violations.push({ rule: 'exit option', line: index + 1 });
      }
    });
  return violations;
}

/** Recursively collect every `.ts` file under `dir`. */
async function listTypeScriptFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('no command sets the exit code', () => {
  it('finds no process.exitCode assignment or exit option under src/cli', async () => {
    const offenders: string[] = [];
    for (const file of await listTypeScriptFiles(CLI_DIR)) {
      if (ALLOWED.has(file)) continue;
      const violations = findViolations(await fs.readFile(file, 'utf8'));
      if (violations.length > 0) {
        const lines = violations.map((violation) => violation.line).join(', ');
        offenders.push(`${path.relative(ROOT, file)} (line ${lines})`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `Commands must throw a CommandError instead of setting process.exitCode:\n${offenders.join('\n')}`,
    );
  });

  it('catches a sample process.exitCode assignment', () => {
    assert.deepEqual(findViolations('process.exitCode = 1;\n'), [
      { rule: 'process.exitCode', line: 1 },
    ]);
  });

  it('catches a sample exit option', () => {
    assert.deepEqual(findViolations('  exit?: (code: number) => void;\n'), [
      { rule: 'exit option', line: 1 },
    ]);
  });

  it('ignores a process.exitCode assignment inside a comment', () => {
    assert.deepEqual(findViolations('// process.exitCode = 1;\n'), []);
    assert.deepEqual(findViolations('/* process.exitCode = 1; */\n'), []);
  });
});
