import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

const CHANGE_ID = '001-cargo-verify';

/** The row's root manifest bytes; the language map reads the root manifest. */
const MANIFESTS: Readonly<Record<string, string>> = {
  'Cargo.toml': '[package]\nname = "core"\nversion = "0.1.0"\n',
  'package.json': '{\n  "name": "fixture"\n}\n',
};

const PROPOSAL = `---
title: Cargo verify
depends_on: []
verify: node verify.cjs
features:
  reads: []
---
## Goal

Lint a cargo verify.

## Surface

None.
`;

const TASKS_MD = '# Tasks\n\n- [ ] 1. Cargo verify lints\n';

function taskMarkdown(verify: string): string {
  return [
    '---',
    'title: Cargo verify lints',
    `verify: ${verify}`,
    'scope: [src/lib.rs]',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] cargo verify lints',
    '',
  ].join('\n');
}

/**
 * A scaffolded project whose root holds `manifest` and one unapproved change
 * whose task 1 verify is `verify`. No git and no `cargo` are needed: the
 * language map reads the root manifest, and lint never executes a command.
 */
async function setupProject(
  manifest: string,
  verify: string,
): Promise<{ root: string; specFolder: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lint-cargo-'));
  roots.push(root);
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, manifest), MANIFESTS[manifest], 'utf8');
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  const specFolder = path.join(root, 'openspec', 'changes', CHANGE_ID);
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(specFolder, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), taskMarkdown(verify), 'utf8');
  return { root, specFolder };
}

/** The unresolved-target warnings lint gave the change. */
async function unresolvedWarnings(manifest: string, verify: string): Promise<readonly string[]> {
  const { root, specFolder } = await setupProject(manifest, verify);
  const result = await lintChangeFolder(root, specFolder, DEFAULT_CONFIG);
  return result.warnings.filter((warning) =>
    warning.includes('verify names neither an existing repository path nor a package script'),
  );
}

describe('Cargo verify', () => {
  // The delta spec's row table: manifest, verify, and the unresolved-target
  // warning lint gives, or none.
  const cases: ReadonlyArray<readonly [string, string, string | null]> = [
    ['Cargo.toml', 'cargo test -p core --test parse', null],
    ['Cargo.toml', 'cargo nextest run', null],
    ['Cargo.toml', 'cargo build --release', null],
    ['Cargo.toml', 'cargo check', null],
    ['Cargo.toml', 'cargo clippy --all-targets', null],
    ['Cargo.toml', 'cargo fmt --check', null],
    ['Cargo.toml', 'cargo run --bin osq', null],
    [
      'Cargo.toml',
      'cargo doc',
      'Task in 1.md verify names neither an existing repository path nor a package script: "cargo doc"',
    ],
    [
      'package.json',
      'cargo test',
      'Task in 1.md verify names neither an existing repository path nor a package script: "cargo test"',
    ],
  ];

  for (const [manifest, verify, warning] of cases) {
    it(`${manifest} + "${verify}" yields ${warning === null ? 'no warning' : 'a warning'}`, async () => {
      assert.deepEqual(
        await unresolvedWarnings(manifest, verify),
        warning === null ? [] : [warning],
      );
    });
  }
});

describe('Chained verify refusal', () => {
  it('names a package script when the root holds package.json', async () => {
    const { root, specFolder } = await setupProject('package.json', 'pnpm a && pnpm b');
    const result = await lintChangeFolder(root, specFolder, DEFAULT_CONFIG);
    assert.ok(
      result.errors.includes(
        'Task in 1.md verify chains commands ("pnpm a && pnpm b"); move the chain into a package script and name that script, for example pnpm run <script>',
      ),
      result.errors.join('\n'),
    );
  });

  it('names a script file when the root holds no package.json', async () => {
    const { root, specFolder } = await setupProject('Cargo.toml', 'cargo build && cargo test');
    const result = await lintChangeFolder(root, specFolder, DEFAULT_CONFIG);
    assert.ok(
      result.errors.includes(
        'Task in 1.md verify chains commands ("cargo build && cargo test"); move the chain into a script file in the repository and name that file, for example scripts/verify.sh',
      ),
      result.errors.join('\n'),
    );
  });
});
