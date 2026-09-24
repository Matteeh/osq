import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { lintCommand } from '../src/cli/lint.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { installFakeValidator } from './helpers.js';

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

interface Recorded {
  readonly level: 'info' | 'verbose' | 'warn' | 'error';
  readonly message: string;
}

type RecordingLogger = Pick<Logger, 'info' | 'verbose' | 'warn' | 'error'> & {
  readonly entries: Recorded[];
};

function createRecordingLogger(): RecordingLogger {
  const entries: Recorded[] = [];
  return {
    entries,
    info: (message) => entries.push({ level: 'info', message }),
    verbose: (message) => entries.push({ level: 'verbose', message }),
    warn: (message) => entries.push({ level: 'warn', message }),
    error: (message) => entries.push({ level: 'error', message }),
  };
}

/**
 * Seed the deterministic local verifier and point a freshly created change's
 * proposal at it. `createNewSpec` intentionally seeds the template planning
 * sentinel, which lint rejects.
 */
async function useLocalVerifier(projectRoot: string, specFolder: string): Promise<void> {
  await fs.writeFile(path.join(projectRoot, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  const proposalPath = path.join(specFolder, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(
    proposalPath,
    proposal.replace(/^verify:\s*.*$/m, `verify: ${PASSING_VERIFY}`),
    'utf8',
  );
}

async function writeTask1(specFolder: string): Promise<void> {
  const task = [
    '---',
    'title: When a spec is processed, the loop logs one line',
    `verify: ${PASSING_VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] logs a line',
  ].join('\n');
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), `${task}\n`, 'utf8');
}

describe('lint skips the rejected folder', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lint-rejected-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('lints only the active change when rejected sits beside it', async () => {
    const rejectedDir = path.join(tmpDir, 'openspec', 'changes', 'rejected', '009-nope');
    await fs.mkdir(rejectedDir, { recursive: true });
    await fs.writeFile(
      path.join(rejectedDir, 'proposal.md'),
      '---\ntitle: Nope\n---\n## Goal\n\nRejected attempt.\n',
      'utf8',
    );

    const spec = await createNewSpec(tmpDir, 'Active Change');
    await useLocalVerifier(tmpDir, spec.folderPath);
    await writeTask1(spec.folderPath);

    const logger = createRecordingLogger();
    const exitCodes: number[] = [];
    const result = await lintCommand([], {
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      logger,
      exit: (code) => exitCodes.push(code),
    });

    const errors = result.entries.flatMap((entry) => entry.result.errors);
    assert.equal(result.valid, true, errors.join('\n'));
    assert.deepEqual(exitCodes, []);
    assert.equal(result.entries.length, 1);
    const findings = logger.entries.filter(
      (entry) => entry.level === 'error' || entry.level === 'warn',
    );
    assert.equal(
      findings.some((entry) => entry.message.includes('rejected')),
      false,
      JSON.stringify(findings),
    );
  });
});
