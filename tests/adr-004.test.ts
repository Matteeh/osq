import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adrPath = path.join(repoRoot, 'decisions', '004-pinned-openspec-validator.md');
const readmePath = path.join(repoRoot, 'decisions', 'README.md');

async function readAdr(): Promise<string> {
  return fs.readFile(adrPath, 'utf8');
}

describe('ADR 004: Pinned OpenSpec Validator', () => {
  it('records the accepted decision for the pinned validator', async () => {
    const adr = await readAdr();
    assert.match(adr, /^# 004\. Pinned OpenSpec Validator$/m, 'ADR must have the expected title');
    assert.match(adr, /^## Status$/m, 'ADR must have a Status section');
    assert.match(adr, /^Accepted$/m, 'ADR status must be Accepted');
    assert.match(adr, /@fission-ai\/openspec/, 'ADR must name the validator package');
    assert.match(adr, /1\.13\.1/, 'ADR must pin version 1.13.1');
  });

  it('defines the exact dependency pin, binary path, and peer range', async () => {
    const adr = await readAdr();
    assert.match(adr, /devDependencies/, 'ADR must document the devDependencies pin');
    assert.match(adr, /1\.13\.1/, 'ADR must pin the exact devDependencies version');
    assert.match(adr, /node_modules\/\.bin\/openspec/, 'ADR must document the local binary path');
    assert.match(adr, /peerDependencies/, 'ADR must document the peerDependencies range');
    assert.match(adr, />=1\.13\.1 <2/, 'ADR must document the accepted peer range');
  });

  it('documents validation execution semantics', async () => {
    const adr = await readAdr();
    assert.match(adr, /OPENSPEC_TELEMETRY=0/, 'ADR must set OPENSPEC_TELEMETRY=0');
    assert.match(adr, /--strict/, 'ADR must run the validator with --strict');
    assert.match(adr, /--json/, 'ADR must run the validator with --json');
    assert.match(adr, /--no-interactive/, 'ADR must run the validator with --no-interactive');
  });

  it('defines doctor diagnostic verification and drift reporting semantics', async () => {
    const adr = await readAdr();
    assert.match(adr, /osq doctor/, 'ADR must describe the doctor check');
    assert.match(
      adr,
      /\[ok\] validator: pinned 1\.13\.1/,
      'ADR must define the healthy doctor line',
    );
    assert.match(
      adr,
      /\[fail\] validator: openspec version .* differs from pinned 1\.13\.1/,
      'ADR must define the version drift doctor line',
    );
    assert.match(
      adr,
      /\[fail\] validator: binary unavailable: openspec/,
      'ADR must define the missing binary doctor line',
    );
    assert.match(adr, /exit.*1/i, 'ADR must state that drift exits 1');
  });

  it('is indexed from the decisions README', async () => {
    const readme = await fs.readFile(readmePath, 'utf8');
    assert.ok(
      readme.includes('004-pinned-openspec-validator.md'),
      'decisions/README.md must reference the ADR file',
    );
    assert.match(readme, /004/, 'decisions/README.md must index ADR 004');
  });
});
