import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readmePath = path.join(repoRoot, 'README.md');

/** The README's Claude Code section: from its heading to the next heading. */
function claudeSection(readme: string): string {
  const lines = readme.split('\n');
  const start = lines.findIndex((line) => /^###\s+Claude Code\s*$/.test(line));
  assert.notEqual(start, -1, 'README must contain a `### Claude Code` section');
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{2,3}\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

describe('claude consumer guidance: README', () => {
  it('lists the claude adapter with fresh headless claude -p tasks', async () => {
    const readme = await fs.readFile(readmePath, 'utf8');
    assert.match(
      readme,
      /`claude`: Claude Code harness adapter running fresh headless `claude -p` tasks/,
      'README must list claude under the available adapters',
    );
  });

  it('documents harness selection, config keys, model fallback, and minimum version', async () => {
    const section = claudeSection(await fs.readFile(readmePath, 'utf8'));
    assert.match(section, /harness:\s*'claude'/);
    assert.match(section, /model:\s*'<[^']+>'/, 'config example must use a placeholder model');
    assert.match(section, /claude\.bin/);
    assert.match(section, /claude\.model[\s\S]{0,160}OSQ_MODEL/);
    assert.match(section, /claude\.sandbox/);
    assert.match(section, /2\.1\.278/);
    assert.match(
      section,
      /doctor[\s\S]{0,200}preflight/i,
      'section must say doctor and preflight enforce the minimum version',
    );
  });

  it('explains login versus ANTHROPIC_API_KEY and harnessAuth', async () => {
    const section = claudeSection(await fs.readFile(readmePath, 'utf8'));
    assert.match(section, /ANTHROPIC_API_KEY/);
    assert.match(section, /--bare/);
    assert.match(section, /login/i);
    assert.match(section, /harnessAuth/);
    assert.match(section, /api_key/);
  });

  it('lists the stripping flags, the token measurement, and that nothing re-enables them', async () => {
    const section = claudeSection(await fs.readFile(readmePath, 'utf8'));
    assert.match(section, /--tools Bash,Read,Edit,Write,Glob,Grep/);
    assert.match(section, /--strict-mcp-config/);
    assert.match(section, /--disable-slash-commands/);
    assert.match(section, /--setting-sources ""/);
    assert.match(section, /--no-session-persistence/);
    assert.match(section, /autoMemoryEnabled/);
    assert.match(section, /29,500/);
    assert.match(section, /13,300/);
    assert.match(section, /no config(uration)? key re-enables/i);
  });

  it('describes containment honestly, with the sandbox and its Linux requirement', async () => {
    const section = claudeSection(await fs.readFile(readmePath, 'utf8'));
    assert.match(section, /dontAsk/);
    assert.match(section, /Bash\(git:\*\)/);
    assert.match(section, /compound command/i);
    assert.match(
      section,
      /without `claude\.sandbox`[\s\S]{0,120}not confined/i,
      'section must say Bash is not confined without claude.sandbox',
    );
    assert.match(section, /network/i);
    assert.match(section, /bubblewrap/);
    assert.match(section, /socat/);
    assert.match(section, /fails? at startup/i);
  });

  it('points planning at the tool-native command and says setup writes no files', async () => {
    const section = claudeSection(await fs.readFile(readmePath, 'utf8'));
    assert.match(section, /\/osq-plan/);
    assert.match(section, /osq setup[\s\S]{0,200}no Claude Code files/i);
  });
});
