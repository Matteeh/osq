import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** The test's own git calls ignore redirecting variables, like osq's reads. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
}

/**
 * The two-crate Cargo workspace of watcher-and-harness's "Rust tests in a
 * Cargo workspace": a root workspace manifest, a `core` crate with an inline
 * `#[cfg(test)] mod tests` and a `tests/` file beside a `benches/` file, and a
 * `cli` crate with an inline test module, a `tests/` file and a data file
 * under it.
 */
export const RUST_WORKSPACE_FILES: Readonly<Record<string, string>> = {
  'Cargo.toml': '[workspace]\nmembers = ["crates/core", "crates/cli"]\n',
  'crates/core/Cargo.toml': '[package]\nname = "core"\nversion = "0.1.0"\n',
  'crates/core/src/lib.rs': [
    'pub fn add(a: i32, b: i32) -> i32 {',
    '    a + b',
    '}',
    '#[cfg(test)]',
    'mod tests {',
    '    use super::*;',
    '',
    '    #[test]',
    '    fn adds() {',
    '        assert_eq!(add(1, 2), 3);',
    '    }',
    '}',
    '',
  ].join('\n'),
  'crates/core/tests/api.rs': ['#[test]', 'fn api() {', '    assert_eq!(2 + 2, 4);', '}', ''].join(
    '\n',
  ),
  'crates/core/benches/speed.rs': 'fn main() {}\n',
  'crates/cli/Cargo.toml': '[package]\nname = "cli"\nversion = "0.1.0"\n',
  'crates/cli/src/main.rs': [
    'fn main() {}',
    '',
    '#[cfg(test)]',
    'mod tests {',
    '    #[test]',
    '    fn works() {',
    '        assert!(true);',
    '    }',
    '}',
    '',
  ].join('\n'),
  'crates/cli/tests/run.rs': ['#[test]', 'fn run() {', '    assert!(true);', '}', ''].join('\n'),
  'crates/cli/tests/data/input.txt': 'input\n',
  '.gitignore': 'node_modules/\n.run/\n',
};

/**
 * Write the two-crate workspace into a fresh temporary folder as committed
 * git files, and return the folder.
 *
 * @scenario watcher-and-harness: Rust tests in a Cargo workspace
 * @adr 017
 */
export async function createRustWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-rust-workspace-'));
  for (const [relative, content] of Object.entries(RUST_WORKSPACE_FILES)) {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'rust workspace'], root);
  return root;
}
