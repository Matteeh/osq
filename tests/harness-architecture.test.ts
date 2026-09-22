import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HARNESS_CATALOG, HARNESS_NAMES } from '../src/core/foundation/harness-catalog.js';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * Generic workflow consumers. These modules must never select behavior by
 * naming a first-party harness: they either use the canonical catalog or the
 * existing adapter ports. `src/core/foundation/config*.ts` is expanded from
 * disk so a new configuration module is covered automatically.
 */
const GENERIC_CONSUMER_PATHS = [
  'src/core/foundation/doctor.ts',
  'src/core/run/manifest.ts',
  'src/cli/plan.ts',
  'src/watcher/loop.ts',
  'src/watcher/spawn.ts',
];

interface Violation {
  readonly line: number;
  readonly reason: string;
  readonly text: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove line and block comments so prose never trips the guardrail. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

/**
 * Find semantic harness-name branches in a generic consumer:
 * - comparisons such as `config.harness === 'agy'` or `adapter.name !== 'codex'`
 * - cross-harness fallbacks such as `config.agy?.model ?? config.opencode?.model`
 *
 * The forbidden names and configuration sections are derived from the catalog,
 * not from a separately maintained list. Typed section access and plain prose
 * are deliberately allowed.
 */
function findHarnessBranches(
  source: string,
  names: readonly string[],
  configKeys: readonly string[],
): Violation[] {
  const lines = stripComments(source).split('\n');
  const nameGroup = names.map(escapeRegExp).join('|');
  const quotedName = `(['"\`])(?:${nameGroup})\\1`;
  const comparison = new RegExp(
    `(?:===|!==|==|!=)\\s*${quotedName}|${quotedName}\\s*(?:===|!==|==|!=)`,
    'i',
  );
  const section = new RegExp(`config\\.(?:${configKeys.map(escapeRegExp).join('|')})\\b`, 'gi');

  const violations: Violation[] = [];
  lines.forEach((line, index) => {
    const text = line.trim();
    if (comparison.test(line)) {
      violations.push({ line: index + 1, reason: 'harness-name comparison', text });
    }
    if (/\?\?|\|\|/.test(line)) {
      const keys = new Set([...line.matchAll(section)].map((match) => match[0].toLowerCase()));
      if (keys.size >= 2) {
        violations.push({ line: index + 1, reason: 'cross-harness fallback', text });
      }
    }
  });
  return violations;
}

async function genericConsumerPaths(): Promise<string[]> {
  const coreDir = path.join(PROJECT_ROOT, 'src', 'core', 'foundation');
  const entries = await fs.readdir(coreDir);
  const configModules = entries
    .filter((entry) => /^config.*\.ts$/.test(entry))
    .map((entry) => `src/core/foundation/${entry}`);
  return [...GENERIC_CONSUMER_PATHS, ...configModules].sort();
}

const CONFIG_KEYS = HARNESS_CATALOG.flatMap((entry) => (entry.configKey ? [entry.configKey] : []));

describe('generic harness consumer architecture', () => {
  it('detects synthetic harness branches and ignores comments and prose', () => {
    const branches = findHarnessBranches(
      [
        "if (config.harness === 'agy') return config.agy?.model;",
        'const model = config.opencode?.model ?? config.agy?.model;',
        "const name = adapter.name === 'codex' ? 'a' : 'b';",
      ].join('\n'),
      HARNESS_NAMES,
      CONFIG_KEYS,
    );
    assert.deepEqual(
      branches.map((violation) => violation.reason),
      ['harness-name comparison', 'cross-harness fallback', 'harness-name comparison'],
    );

    assert.deepEqual(
      findHarnessBranches(
        [
          "// config.harness === 'agy' is forbidden here",
          "/* adapter.name !== 'codex' must not appear either */",
          "const summary = 'mock harness requires no binary';",
          'const key = entry.configKey;',
        ].join('\n'),
        HARNESS_NAMES,
        CONFIG_KEYS,
      ),
      [],
    );
  });

  it('covers every generic consumer and derives forbidden names from the catalog', async () => {
    const paths = await genericConsumerPaths();
    assert.ok(paths.includes('src/core/foundation/config-doctor.ts'));
    assert.ok(paths.includes('src/watcher/loop.ts'));
    assert.ok(paths.includes('src/watcher/spawn.ts'));
    assert.ok(HARNESS_NAMES.length > 0);
  });

  it('contains no harness-name comparisons or cross-harness fallbacks', async () => {
    const paths = await genericConsumerPaths();
    const violations: Array<{ file: string; violation: Violation }> = [];

    for (const relativePath of paths) {
      const source = await fs.readFile(path.join(PROJECT_ROOT, relativePath), 'utf8');
      for (const violation of findHarnessBranches(source, HARNESS_NAMES, CONFIG_KEYS)) {
        violations.push({ file: relativePath, violation });
      }
    }

    assert.deepEqual(
      violations,
      [],
      violations
        .map(
          ({ file, violation }) =>
            `${file}:${violation.line} ${violation.reason}: ${violation.text}`,
        )
        .join('\n'),
    );
  });
});
